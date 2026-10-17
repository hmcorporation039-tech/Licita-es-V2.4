import { isAxiosError } from 'axios'
import { LimiteDeRequisicoesExcedido, ehPaginaDeLimiteDeRequisicoes, esperaAntesDeTentarDeNovo, pncpClient } from '../lib/httpClient'
import { formatDateOnly } from '../lib/coletaWindow'

export const MODALIDADES_PNCP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
export const TAMANHO_PAGINA_PNCP = 50
export const CAMINHO_PUBLICACAO_PNCP = '/v1/contratacoes/publicacao'
export const CAMINHO_PROPOSTA_PNCP = '/v1/contratacoes/proposta'
export const TENTATIVAS_EXTRAS_POR_PAGINA = 3
export const ORCAMENTO_DE_TENTATIVAS_POR_EXECUCAO = 12
export const PAGINAS_COM_FALHA_SEGUIDAS_PARA_DESISTIR = 2
export const HORIZONTE_DAS_PROPOSTAS_DIAS = 3650

const DIA_MS = 86_400_000
const CODIGOS_DE_REDE_TRANSITORIOS = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ERR_NETWORK', 'ENETUNREACH']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContratacaoPncp = Record<string, any>

export type ParametrosPncp = Record<string, string | number>

export interface PaginaPncp {
  itens: ContratacaoPncp[]
  totalPaginas: number
}

export interface RedeDoPncp {
  buscarPagina: (caminho: string, parametros: ParametrosPncp) => Promise<PaginaPncp>
  esperar: (ms: number) => Promise<void>
}

export class RespostaInesperadaDoPncp extends Error {
  constructor(caminho: string) {
    super(`PNCP devolveu conteúdo que não é JSON em ${caminho}`)
    this.name = 'RespostaInesperadaDoPncp'
  }
}

export function lerPaginaPncp(caminho: string, status: number, corpo: unknown): PaginaPncp {
  if (status === 204 || corpo === undefined || corpo === null || corpo === '') return { itens: [], totalPaginas: 0 }
  if (typeof corpo === 'string') {
    if (ehPaginaDeLimiteDeRequisicoes(corpo)) throw new LimiteDeRequisicoesExcedido('PNCP')
    throw new RespostaInesperadaDoPncp(caminho)
  }
  if (Array.isArray(corpo)) return { itens: corpo, totalPaginas: 1 }
  const pagina = corpo as { data?: unknown; totalPaginas?: unknown; empty?: unknown }
  const itens = Array.isArray(pagina.data) ? (pagina.data as ContratacaoPncp[]) : []
  if (pagina.empty === true && itens.length === 0) return { itens: [], totalPaginas: 0 }
  const totalPaginas = Number(pagina.totalPaginas)
  return { itens, totalPaginas: Number.isFinite(totalPaginas) && totalPaginas >= 0 ? totalPaginas : 1 }
}

export async function buscarPaginaPncp(caminho: string, parametros: ParametrosPncp): Promise<PaginaPncp> {
  const resposta = await pncpClient.get(caminho, { params: parametros })
  return lerPaginaPncp(caminho, resposta.status, resposta.data)
}

export const REDE_DO_PNCP: RedeDoPncp = {
  buscarPagina: buscarPaginaPncp,
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export function ehFalhaTransitoria(err: unknown): boolean {
  if (err instanceof LimiteDeRequisicoesExcedido || err instanceof RespostaInesperadaDoPncp) return true
  if (!isAxiosError(err) && !(err && typeof err === 'object' && (err as { isAxiosError?: boolean }).isAxiosError)) return false
  const erro = err as { response?: { status?: number }; code?: string }
  const status = erro.response?.status
  if (status !== undefined) return status === 429 || status >= 500
  return erro.code !== undefined && CODIGOS_DE_REDE_TRANSITORIOS.includes(erro.code)
}

function motivoDaFalha(err: unknown): string {
  const erro = err as { response?: { status?: number }; code?: string; message?: string }
  if (erro?.response?.status) return `HTTP ${erro.response.status}`
  if (erro?.code) return erro.code
  return err instanceof Error ? err.message : String(err)
}

export function datasDoPncp(dia: string): string {
  return dia.replace(/-/g, '')
}

export function parametrosDaVarreduraDePropostas(agora: Date = new Date()): ParametrosPncp {
  return { dataFinal: datasDoPncp(formatDateOnly(new Date(agora.getTime() + HORIZONTE_DAS_PROPOSTAS_DIAS * DIA_MS))) }
}

export interface ContadoresDaColeta {
  vistos: number
  novos: number
  atualizados: number
  inalterados: number
  descartados: number
  comErro: number
}

export function contadoresZerados(): ContadoresDaColeta {
  return { vistos: 0, novos: 0, atualizados: 0, inalterados: 0, descartados: 0, comErro: 0 }
}

export type StatusDaColeta = 'SUCCESS' | 'PARTIAL' | 'FAILED'

export interface ResumoDaColetaPncp {
  contadores: ContadoresDaColeta
  respostasLidas: number
  tentativasExtras: number
  falhas: string[]
  interrompida: boolean
  status: StatusDaColeta
}

export interface ColetaPncp {
  caminho: string
  parametros: ParametrosPncp
  gravar: (itens: ContratacaoPncp[], contadores: ContadoresDaColeta) => Promise<void>
  contexto: string
  modalidades?: number[]
  rede?: RedeDoPncp
  orcamentoDeTentativas?: number
  aoTerminarModalidade?: (indice: number, total: number) => Promise<void>
}

interface Orcamento {
  restante: number
}

async function buscarComTentativas(
  coleta: ColetaPncp,
  rede: RedeDoPncp,
  orcamento: Orcamento,
  parametros: ParametrosPncp,
  resumo: ResumoDaColetaPncp
): Promise<PaginaPncp> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await rede.buscarPagina(coleta.caminho, parametros)
    } catch (err) {
      if (!ehFalhaTransitoria(err) || tentativa > TENTATIVAS_EXTRAS_POR_PAGINA || orcamento.restante <= 0) throw err
      orcamento.restante--
      resumo.tentativasExtras++
      const espera = esperaAntesDeTentarDeNovo(tentativa)
      console.warn(
        `[${coleta.contexto}] ${motivoDaFalha(err)} na modalidade ${parametros.codigoModalidadeContratacao}, página ${parametros.pagina} — nova tentativa ${tentativa}/${TENTATIVAS_EXTRAS_POR_PAGINA} em ${Math.round(espera / 1000)}s`
      )
      await rede.esperar(espera)
    }
  }
}

export function statusDaColeta(respostasLidas: number, falhas: string[]): StatusDaColeta {
  if (falhas.length === 0) return 'SUCCESS'
  return respostasLidas === 0 ? 'FAILED' : 'PARTIAL'
}

export async function coletarModalidadesPncp(coleta: ColetaPncp): Promise<ResumoDaColetaPncp> {
  const rede = coleta.rede ?? REDE_DO_PNCP
  const modalidades = coleta.modalidades ?? MODALIDADES_PNCP
  const orcamento: Orcamento = { restante: coleta.orcamentoDeTentativas ?? ORCAMENTO_DE_TENTATIVAS_POR_EXECUCAO }
  const resumo: ResumoDaColetaPncp = {
    contadores: contadoresZerados(),
    respostasLidas: 0,
    tentativasExtras: 0,
    falhas: [],
    interrompida: false,
    status: 'SUCCESS',
  }

  for (const [indice, modalidade] of modalidades.entries()) {
    if (resumo.interrompida) {
      resumo.falhas.push(`modalidade ${modalidade}: não consultada (coleta interrompida)`)
      continue
    }

    let pagina = 1
    let totalPaginas = 1
    let totalConhecido = false
    let falhasSeguidas = 0

    while (pagina <= totalPaginas) {
      const parametros: ParametrosPncp = {
        ...coleta.parametros,
        codigoModalidadeContratacao: modalidade,
        pagina,
        tamanhoPagina: TAMANHO_PAGINA_PNCP,
      }

      try {
        const lida = await buscarComTentativas(coleta, rede, orcamento, parametros, resumo)
        resumo.respostasLidas++
        falhasSeguidas = 0
        if (lida.totalPaginas === 0) break
        totalPaginas = Math.max(lida.totalPaginas, pagina)
        totalConhecido = true
        await coleta.gravar(lida.itens, resumo.contadores)
      } catch (err) {
        const motivo = motivoDaFalha(err)
        resumo.falhas.push(`modalidade ${modalidade}, página ${pagina}: ${motivo}`)
        console.error(`[${coleta.contexto}] Modalidade ${modalidade}, página ${pagina} falhou (${motivo})`)
        falhasSeguidas++
        if (ehFalhaTransitoria(err) && orcamento.restante <= 0) {
          resumo.interrompida = true
          console.error(`[${coleta.contexto}] Tentativas da execução esgotadas — PNCP instável, coleta interrompida`)
          break
        }
        if (!ehFalhaTransitoria(err) || falhasSeguidas >= PAGINAS_COM_FALHA_SEGUIDAS_PARA_DESISTIR) break
        if (!totalConhecido) totalPaginas = pagina + 1
      }

      pagina++
    }

    await coleta.aoTerminarModalidade?.(indice + 1, modalidades.length)
  }

  resumo.status = statusDaColeta(resumo.respostasLidas, resumo.falhas)
  return resumo
}
