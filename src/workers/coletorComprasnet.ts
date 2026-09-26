// ============================================================
// workers/coletorComprasnet.ts — Coleta do ComprasNet (módulo legado)
// - /modulo-legado/1_consultarLicitacao (licitação competitiva, Lei 8.666/10.520)
// - /modulo-legado/5_consultarComprasSemLicitacao (dispensa/inexigibilidade)
// Docs: https://dadosabertos.compras.gov.br/swagger-ui/index.html
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection, matcherQueue } from '../queues'
import { comprasnetClient } from '../lib/httpClient'
import { parseComprasnetTender, parseComprasnetDispensa } from '../services/comprasnetParser'
import { prisma, saveTender, saveWorkerLog } from '../services/tenderService'
import { findMunicipioByNomeUf } from '../lib/geoService'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { resolveColetaWindow } from '../lib/coletaWindow'
import { ultimaPublicacaoColetada } from '../services/coletaCursorService'
import { avisarAlteracaoDeTender } from '../services/tenderChangeService'
import { ColetorJobPayload, NormalizedTender } from '../types'

// A API exige tamanhoPagina entre 10 e 500
const ITEMS_PER_PAGE = 100

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPaginated(endpoint: string, params: Record<string, any>, pagina: number) {
  const response = await comprasnetClient.get(endpoint, {
    params: { ...params, pagina, tamanhoPagina: ITEMS_PER_PAGE },
  })
  const body = response.data
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (body.resultado ?? []) as Record<string, any>[],
    totalPages: (body.totalPaginas ?? 1) as number,
  }
}

// O endpoint do módulo legado não devolve UF nem órgão — só o código da UASG.
// Como o matcher trata UF como portão, quem filtra por estado (quase todo
// mundo) nunca via nada do ComprasNet. A tabela Uasg já está no banco com UF,
// órgão e município: basta cruzar antes de salvar.
async function enriquecerComUasg(tenders: NormalizedTender[]): Promise<NormalizedTender[]> {
  const codigos = Array.from(
    new Set(tenders.map((t) => t.unidade).filter((u): u is string => Boolean(u)))
  )
  if (codigos.length === 0) return tenders

  const uasgs = await prisma.uasg.findMany({
    where: { codigoUasg: { in: codigos } },
    select: { codigoUasg: true, nomeUasg: true, nomeOrgao: true, siglaUf: true, municipioNome: true },
  })
  if (uasgs.length === 0) return tenders

  const porCodigo = new Map(uasgs.map((u) => [u.codigoUasg, u]))

  return tenders.map((tender) => {
    const uasg = tender.unidade ? porCodigo.get(tender.unidade) : undefined
    if (!uasg) return tender

    const uf = tender.uf ?? uasg.siglaUf ?? undefined
    const municipio = tender.municipio ?? uasg.municipioNome ?? undefined
    const geo = municipio && uf ? findMunicipioByNomeUf(municipio, uf) : undefined

    return {
      ...tender,
      uf,
      municipio,
      municipioIbge: tender.municipioIbge ?? geo?.codigoIbge,
      municipioLat: tender.municipioLat ?? geo?.lat,
      municipioLng: tender.municipioLng ?? geo?.lng,
      orgao: tender.orgao ?? uasg.nomeOrgao ?? uasg.nomeUasg,
    }
  })
}

// Salva um lote de tenders já normalizados, retornando contadores
async function saveAll(
  tenders: NormalizedTender[]
): Promise<{ totalNew: number; totalDupes: number; totalUpdated: number }> {
  let totalNew = 0
  let totalDupes = 0
  let totalUpdated = 0
  const enriquecidos = await enriquecerComUasg(tenders)
  for (const tender of enriquecidos) {
    try {
      const result = await saveTender(tender)
      if (result.isNew) {
        totalNew++
        await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: result.tenderId }, 'ComprasNet Worker')
      } else {
        totalDupes++
        if (result.changed) {
          totalUpdated++
          await avisarAlteracaoDeTender(result.tenderId, result.changedFields)
        }
      }
    } catch (itemErr) {
      console.error('[ComprasNet Worker] Erro ao processar item:', itemErr)
    }
  }
  return { totalNew, totalDupes, totalUpdated }
}

export function startColetorComprasnetWorker() {
  const worker = new Worker<ColetorJobPayload>(
    'coletor-comprasnet',
    async (job: Job<ColetorJobPayload>) => {
      const { dataInicial, dataFinal } = resolveColetaWindow(job.data, {
        ultimaPublicacaoColetada: await ultimaPublicacaoColetada('COMPRASNET'),
      })
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let hadErrors = false

      console.log(`[ComprasNet Worker] Iniciando coleta ${dataInicial} → ${dataFinal}`)

      // --- Fase 1: licitação competitiva (Lei 8.666/10.520) ---
      try {
        let pagina = 1
        let totalPages = 1
        while (pagina <= totalPages) {
          await job.updateProgress(Math.round((pagina / (totalPages || 1)) * 50))
          const { data, totalPages: tp } = await fetchPaginated(
            '/modulo-legado/1_consultarLicitacao',
            { data_publicacao_inicial: dataInicial, data_publicacao_final: dataFinal },
            pagina
          )
          totalPages = tp
          totalFetched += data.length
          const result = await saveAll(data.map(parseComprasnetTender))
          totalNew += result.totalNew
          totalDupes += result.totalDupes
          totalUpdated += result.totalUpdated
          pagina++
        }
      } catch (err) {
        hadErrors = true
        console.error('[ComprasNet Worker] Erro na coleta de licitações, seguindo para dispensas:', err)
      }

      // --- Fase 2: dispensa/inexigibilidade (compra sem licitação) ---
      // O endpoint exige o ano (dt_ano_aviso); a data de declaração nem sempre
      // vem preenchida na fonte, então o filtro de período é best-effort — dados
      // com a data ausente só entram quando ela é preenchida numa atualização futura.
      // Na prática o módulo legado (Lei 8.666) está quase inativo para o ano
      // corrente — a atividade real migrou para o PNCP (Lei 14.133). É esperado
      // (não é bug) esta fase retornar 0 resultados na maioria das execuções.
      try {
        const anos = new Set([new Date(dataInicial).getUTCFullYear(), new Date(dataFinal).getUTCFullYear()])

        for (const ano of anos) {
          let pagina = 1
          let totalPages = 1
          while (pagina <= totalPages) {
            await job.updateProgress(50 + Math.round((pagina / (totalPages || 1)) * 50))
            const { data, totalPages: tp } = await fetchPaginated(
              '/modulo-legado/5_consultarComprasSemLicitacao',
              {
                dt_ano_aviso: ano,
                dtDeclaracaoDispensaInicial: dataInicial,
                dtDeclaracaoDispensaFinal: dataFinal,
              },
              pagina
            )
            totalPages = tp
            totalFetched += data.length
            const result = await saveAll(data.map(parseComprasnetDispensa))
            totalNew += result.totalNew
            totalDupes += result.totalDupes
            totalUpdated += result.totalUpdated
            pagina++
          }
        }
      } catch (err) {
        hadErrors = true
        console.error('[ComprasNet Worker] Erro na coleta de dispensas:', err)
      }

      await saveWorkerLog({
        worker: 'coletor-comprasnet',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'COMPRASNET',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'Uma das fases (licitação/dispensa) falhou — ver logs do worker' : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[ComprasNet Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      // Ver comentário equivalente em coletorPNCP.ts — reduz o gasto de
      // requisições do Redis (limite do plano gratuito do Upstash).
      stalledInterval: 300_000, // 5min
      lockDuration: 600_000, // 10min — cobre uma coleta paginada inteira
    }
  )

  worker.on('completed', (job) => {
    console.log(`[ComprasNet Worker] Job ${job.id} concluído.`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[ComprasNet Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
