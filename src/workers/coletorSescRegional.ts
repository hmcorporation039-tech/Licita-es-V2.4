// ============================================================
// workers/coletorSescRegional.ts — Coleta as licitações ATUAIS dos portais dos
// Departamentos Regionais do SESC (exceto GO, que tem coletor próprio).
//
// Cada unidade tem um site diferente e um parser próprio em
// services/sescRegional/<uf>.ts. Este worker só orquestra: busca as páginas de
// cada unidade, passa o HTML ao parser, e salva pelo mesmo caminho das outras
// fontes (saveTender -> dedupe por content hash -> fila do matcher).
//
// Princípios:
//  - Falha isolada: um portal fora do ar ou que mudou de layout NÃO derruba a
//    coleta das demais unidades (cada unidade tem o seu try/catch).
//  - Só URLs do próprio domínio da unidade são seguidas na paginação (o HTML é
//    dado de terceiros — um link malicioso não pode desviar o coletor).
//  - Só licitações atuais: o filtro está em cada parser (ver tipos.ts).
// ============================================================

import type { Agent } from 'node:https'
import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { sescRegionalClient } from '../lib/httpClient'
import { SESC_UNIDADES } from '../services/sescRegional'
import { agenteDaUnidade } from '../services/sescRegional/certificados'
import { MAX_PAGINAS_POR_UNIDADE, SescUnidade, decodificarHtml } from '../services/sescRegional/tipos'
import { saveWorkerLog } from '../services/tenderService'
import { NormalizedTender } from '../types'
import { salvarLote } from './coletorHtmlShared'

interface Sessao {
  cookie?: string
  referer?: string
  // Agente HTTPS da unidade (ver agenteDaUnidade).
  agente?: Agent
}

// Abre a página de sessão da unidade (se houver) e guarda os cookies que o
// portal entrega, para reenviá-los nas páginas seguintes.
async function abrirSessao(sessaoUrl: string, agente?: Agent): Promise<Sessao> {
  const response = await sescRegionalClient.get(sessaoUrl, { timeout: 45_000, httpsAgent: agente })
  const setCookie = response.headers['set-cookie'] as string[] | undefined
  const cookie = setCookie?.map((c) => c.split(';')[0]).join('; ')
  return { cookie: cookie || undefined, referer: sessaoUrl, agente }
}

async function baixarPagina(url: string, sessao: Sessao = {}, unidade?: SescUnidade): Promise<string> {
  const config = {
    responseType: 'arraybuffer' as const,
    timeout: 45_000,
    httpsAgent: sessao.agente,
    headers: {
      ...(sessao.cookie ? { Cookie: sessao.cookie } : {}),
      ...(sessao.referer ? { Referer: sessao.referer } : {}),
    },
  }
  // Portais cuja lista só sai por POST (API JSON do próprio site).
  const post = unidade?.requisicaoPost?.(url)
  const response = post
    ? await sescRegionalClient.post<ArrayBuffer>(url, post.corpo, {
        ...config,
        headers: { ...config.headers, 'Content-Type': post.contentType ?? 'application/json' },
      })
    : await sescRegionalClient.get<ArrayBuffer>(url, config)
  return decodificarHtml(Buffer.from(response.data), String(response.headers['content-type'] ?? ''))
}

function mesmoDominio(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '')
  } catch {
    return false
  }
}

// Coleta todas as páginas de uma unidade e devolve as licitações atuais,
// sem repetir o mesmo fonteId (a mesma licitação pode aparecer em 2 páginas).
export async function coletarUnidade(unidade: SescUnidade, agora = new Date()): Promise<NormalizedTender[]> {
  const agente = agenteDaUnidade(unidade)
  const sessao: Sessao = unidade.sessaoUrl ? await abrirSessao(unidade.sessaoUrl, agente) : { agente }
  const fila = [...unidade.urls(agora)]
  const vistas = new Set<string>()
  const porFonteId = new Map<string, NormalizedTender>()

  while (fila.length > 0 && vistas.size < MAX_PAGINAS_POR_UNIDADE) {
    const url = fila.shift()!
    if (vistas.has(url)) continue
    vistas.add(url)

    const html = await baixarPagina(url, sessao, unidade)
    for (const tender of unidade.parse(html, { url, agora })) {
      porFonteId.set(tender.fonteId, tender)
    }

    for (const proxima of unidade.proximasPaginas?.(html, { url, agora }) ?? []) {
      if (!vistas.has(proxima) && mesmoDominio(proxima, url)) fila.push(proxima)
    }
  }

  return [...porFonteId.values()]
}

export function startColetorSescRegionalWorker() {
  const worker = new Worker(
    'coletor-sesc-regional',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      const falhas: string[] = []

      for (const unidade of SESC_UNIDADES) {
        try {
          const tenders = await coletarUnidade(unidade)
          totalFetched += tenders.length
          const r = await salvarLote(tenders, `SESC ${unidade.uf} Worker`)
          totalNew += r.totalNew
          totalDupes += r.totalDupes
          totalUpdated += r.totalUpdated
          console.log(`[SESC Regional] ${unidade.uf}: ${tenders.length} atual(is), ${r.totalNew} nova(s).`)
        } catch (err) {
          // Um portal com problema não impede as outras unidades.
          falhas.push(unidade.uf)
          console.error(`[SESC Regional] ${unidade.uf} falhou:`, err instanceof Error ? err.message : err)
        }
      }

      const hadErrors = falhas.length > 0
      await saveWorkerLog({
        worker: 'coletor-sesc-regional',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'SESC_REGIONAL',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? `Unidades com falha: ${falhas.join(', ')}` : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[SESC Regional] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}${hadErrors ? `, falhas: ${falhas.join(', ')}` : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000,
      lockDuration: 900_000, // 15min — varre várias unidades em sequência
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[SESC Regional Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
