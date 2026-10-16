import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { paradigmaDaIndustriaClient, portalDaIndustriaClient, senacTransparenciaClient, sistemaSHtmlClient } from '../lib/httpClient'
import { saveWorkerLog } from '../services/tenderService'
import { existeNoPncpSistemaS } from '../services/sistemaS/duplicidade'
import {
  MAXIMO_DE_PAGINAS_DA_INDUSTRIA,
  PORTAIS_DA_INDUSTRIA,
  PortalDaIndustria,
  lerPaginaDaIndustria,
  parseLicitacoesDaIndustria,
  proximaPaginaDaIndustria,
  urlDaPrimeiraPagina,
} from '../services/sistemaS/portalDaIndustria'
import { UNIDADES_DA_INDUSTRIA_NO_PARADIGMA, contarProcessosDoParadigma } from '../services/sistemaS/paradigmaDaIndustria'
import { REGIONAIS_DO_SENAC, RegionalDoSenac, caminhoDaRegional, lerRespostaDoSenac, parseLicitacoesDoSenac } from '../services/sistemaS/senac'
import { FONTES_DA_TRANSPARENCIA_SP } from '../services/sistemaS/transparenciaSp'
import { FONTE_DO_AC } from '../services/sistemaS/fieac'
import { FONTE_DO_MA } from '../services/sistemaS/fiema'
import { FONTE_DO_RN } from '../services/sistemaS/fiern'
import { FonteHtmlDoSistemaS } from '../services/sistemaS/comum'
import { SescUnidade } from '../services/sescRegional/tipos'
import { NormalizedTender } from '../types'
import { RedeDeColeta, coletarUnidade, redirectPermitido } from './coletorSescRegional'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'Sistema S Worker'
const MAX_REDIRECTS = 3
const REDE_DO_PARADIGMA_DA_INDUSTRIA: RedeDeColeta = { cliente: paradigmaDaIndustriaClient, timeoutMs: 60_000 }
const REDE_DAS_PAGINAS_HTML: RedeDeColeta = { cliente: sistemaSHtmlClient, timeoutMs: 60_000 }

export const FONTES_HTML_DO_SISTEMA_S: FonteHtmlDoSistemaS[] = [...FONTES_DA_TRANSPARENCIA_SP, FONTE_DO_AC, FONTE_DO_MA, FONTE_DO_RN]

export interface ColetaDaOrigem {
  origem: string
  lidos: number
  tenders: NormalizedTender[]
}

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function motivoCurto(err: unknown): string {
  const e = err as { code?: unknown; response?: { status?: unknown }; message?: unknown }
  const partes = [
    typeof e?.response?.status === 'number' ? `HTTP ${e.response.status}` : '',
    typeof e?.code === 'string' ? e.code : '',
    !e?.response && typeof e?.message === 'string' ? e.message.replace(/https?:\/\/\S+/g, '').slice(0, 60) : '',
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' ') : 'erro desconhecido'
}

function semRepetir(tenders: NormalizedTender[]): NormalizedTender[] {
  return [...new Map(tenders.map((t) => [t.fonteId, t])).values()]
}

export async function coletarSenac(regional: RegionalDoSenac, agora = new Date()): Promise<ColetaDaOrigem> {
  const resposta = await senacTransparenciaClient.get<string>(caminhoDaRegional(regional), {
    responseType: 'text',
    transformResponse: (dados) => dados,
    maxRedirects: 0,
  })
  const json = lerRespostaDoSenac(resposta.data)
  const lidos = (json.data ?? []).reduce((total, grupo) => total + (grupo.dadosModalidadeLicitacao?.length ?? 0), 0)
  return { origem: `SENAC-${regional.toUpperCase()}`, lidos, tenders: semRepetir(parseLicitacoesDoSenac(json, regional, agora)) }
}

export async function coletarPortalDaIndustria(portal: PortalDaIndustria, agora = new Date()): Promise<ColetaDaOrigem> {
  const tenders: NormalizedTender[] = []
  const vistas = new Set<string>()
  let lidos = 0
  let url: string | undefined = urlDaPrimeiraPagina(portal)

  while (url && !vistas.has(url) && vistas.size < MAXIMO_DE_PAGINAS_DA_INDUSTRIA) {
    vistas.add(url)
    const atual: string = url
    const resposta = await portalDaIndustriaClient.get<string>(atual, {
      responseType: 'text',
      transformResponse: (dados) => dados,
      maxRedirects: MAX_REDIRECTS,
      beforeRedirect: (opcoes: { protocol?: string; hostname?: string; host?: string }) => {
        if (!redirectPermitido(atual, opcoes)) throw new Error(`Redirect recusado: ${atual} tentou levar para outro host ou rebaixar para HTTP`)
      },
    })
    const pagina = lerPaginaDaIndustria(resposta.data)
    lidos += pagina.results?.length ?? 0
    tenders.push(...parseLicitacoesDaIndustria(pagina, portal, agora))
    url = proximaPaginaDaIndustria(pagina, portal)
  }

  return { origem: `IND-${portal.chave}`, lidos, tenders: semRepetir(tenders) }
}

export async function coletarParadigmaDaIndustria(unidade: SescUnidade, agora = new Date()): Promise<ColetaDaOrigem> {
  let lidos = 0
  const contada: SescUnidade = {
    ...unidade,
    parse: (texto, ctx) => {
      lidos += contarProcessosDoParadigma(texto)
      return unidade.parse(texto, ctx)
    },
  }
  const tenders = await coletarUnidade(contada, agora, REDE_DO_PARADIGMA_DA_INDUSTRIA)
  return { origem: `IND-PDG-${unidade.uf}`, lidos, tenders }
}

export async function coletarPaginasHtml(fonte: FonteHtmlDoSistemaS, agora = new Date()): Promise<ColetaDaOrigem> {
  let lidos = 0
  const contada: SescUnidade = {
    ...fonte.unidade,
    parse: (html, ctx) => {
      lidos += fonte.contar(html)
      return fonte.unidade.parse(html, ctx)
    },
  }
  const tenders = await coletarUnidade(contada, agora, REDE_DAS_PAGINAS_HTML)
  return { origem: fonte.origem, lidos, tenders }
}

export function coletasDoSistemaS(agora: Date): { origem: string; coletar: () => Promise<ColetaDaOrigem> }[] {
  return [
    ...REGIONAIS_DO_SENAC.map((regional) => ({ origem: `SENAC-${regional.toUpperCase()}`, coletar: () => coletarSenac(regional, agora) })),
    ...PORTAIS_DA_INDUSTRIA.map((portal) => ({ origem: `IND-${portal.chave}`, coletar: () => coletarPortalDaIndustria(portal, agora) })),
    ...UNIDADES_DA_INDUSTRIA_NO_PARADIGMA.map((unidade) => ({
      origem: `IND-PDG-${unidade.uf}`,
      coletar: () => coletarParadigmaDaIndustria(unidade, agora),
    })),
    ...FONTES_HTML_DO_SISTEMA_S.map((fonte) => ({ origem: fonte.origem, coletar: () => coletarPaginasHtml(fonte, agora) })),
  ]
}

export function startColetorSistemaSWorker() {
  const worker = new Worker(
    'coletor-sistema-s',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let duplicadosDoPncp = 0
      const falhas: string[] = []
      const coletas = coletasDoSistemaS(startedAt)

      for (const { origem, coletar } of coletas) {
        try {
          const coleta = await coletar()
          const lote: NormalizedTender[] = []
          for (const tender of coleta.tenders) {
            if (await existeNoPncpSistemaS(tender, startedAt)) duplicadosDoPncp++
            else lote.push(tender)
          }
          totalFetched += lote.length
          const salvos = await salvarLote(lote, CONTEXTO)
          totalNew += salvos.totalNew
          totalDupes += salvos.totalDupes
          totalUpdated += salvos.totalUpdated
          console.log(
            `[${CONTEXTO}] ${origem}: ${coleta.lidos} lido(s), ${coleta.tenders.length} atual(is), ` +
              `${coleta.tenders.length - lote.length} já no PNCP, ${salvos.totalNew} nova(s).`
          )
        } catch (err) {
          falhas.push(`${origem} (${motivoCurto(err)})`)
          console.error(`[${CONTEXTO}] ${origem} falhou:`, mensagemDoErro(err))
        }
      }

      const status = falhas.length === 0 ? 'SUCCESS' : falhas.length === coletas.length ? 'FAILED' : 'PARTIAL'
      await saveWorkerLog({
        worker: 'coletor-sistema-s',
        status,
        fonte: 'SISTEMA_S',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: falhas.length > 0 ? `Origens com falha: ${falhas.join(', ')}` : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[${CONTEXTO}] Concluído — coletados: ${totalFetched}, já no PNCP: ${duplicadosDoPncp}, novos: ${totalNew}, ` +
          `atualizados: ${totalUpdated}${falhas.length > 0 ? `, falhas: ${falhas.join(', ')}` : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000,
      lockDuration: 1_800_000,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[${CONTEXTO}] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
