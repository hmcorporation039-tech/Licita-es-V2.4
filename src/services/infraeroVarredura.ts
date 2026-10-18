import { SituacaoEnum } from '@prisma/client'
import { infraeroClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { NormalizedTender } from '../types'
import { CAMINHO_DO_DETALHE_INFRAERO, LeituraDoDetalheInfraero, parseInfraeroDetalhe, urlDoDetalheInfraero } from './infraeroParser'
import { decodificarHtml } from './sescRegional/tipos'
import { semSegredos } from './alertaOperacional'

export const INFRAERO_ID_INICIAL = 177_900
export const RECUO_DO_CURSOR = 20
export const NAO_ENCONTRADOS_PARA_PARAR = 60
export const SALTO_DA_SONDA = 100
export const MAX_REQUISICOES_NOVAS = 250
export const MAX_REVISITAS = 60
export const TENTATIVAS_POR_ID = 3
export const ESPERA_ENTRE_TENTATIVAS_MS = 5_000
export const FALHAS_SEGUIDAS_PARA_DESISTIR = 3
export const DIAS_DE_REVISITA_APOS_A_SESSAO = 7
export const SALTOS_DAS_SONDAS_APOS_FALHAS = [25, 100, 400]
export const ESPERA_ANTES_DA_SONDA_APOS_FALHAS_MS = 15_000
export const MAX_FALHAS_NA_VARREDURA = 15
export const TAMANHO_DO_TRECHO_DIAGNOSTICO = 300

const DIA_MS = 86_400_000

export interface PaginaDaInfraero {
  html: string
  status?: number
  urlFinal?: string
  tipoDeConteudo?: string
}

export interface RedeDaInfraero {
  baixarDetalhe: (idLicitacao: number) => Promise<string | PaginaDaInfraero>
  esperar: (ms: number) => Promise<void>
}

function urlFinalDaResposta(resposta: { request?: { res?: { responseUrl?: unknown } } }, idLicitacao: number): string {
  const final = resposta.request?.res?.responseUrl
  return typeof final === 'string' && final ? final : urlDoDetalheInfraero(idLicitacao)
}

export const REDE_DA_INFRAERO: RedeDaInfraero = {
  baixarDetalhe: async (idLicitacao) => {
    const resposta = await infraeroClient.get<ArrayBuffer>(CAMINHO_DO_DETALHE_INFRAERO, {
      params: { idLicitacao },
      responseType: 'arraybuffer',
    })
    const tipoDeConteudo = String(resposta.headers['content-type'] ?? '')
    return {
      html: decodificarHtml(Buffer.from(resposta.data), tipoDeConteudo),
      status: resposta.status,
      urlFinal: urlFinalDaResposta(resposta, idLicitacao),
      tipoDeConteudo,
    }
  },
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface DiagnosticoDaPagina {
  status: number | null
  urlFinal: string | null
  tipoDeConteudo: string | null
  tamanho: number
  inicio: string
}

function urlSemSegredos(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const id = u.searchParams.get('idLicitacao')
    return `${u.origin}${u.pathname.replace(/;jsessionid=[^/]*/i, '')}${id ? `?idLicitacao=${encodeURIComponent(id)}` : ''}`
  } catch {
    return null
  }
}

export function diagnosticoDaPagina(pagina: PaginaDaInfraero): DiagnosticoDaPagina {
  return {
    status: pagina.status ?? null,
    urlFinal: urlSemSegredos(pagina.urlFinal),
    tipoDeConteudo: pagina.tipoDeConteudo || null,
    tamanho: pagina.html.length,
    inicio: semSegredos(pagina.html.replace(/\s+/g, ' ').trim()).slice(0, TAMANHO_DO_TRECHO_DIAGNOSTICO),
  }
}

export function resumoDoDiagnostico(d: DiagnosticoDaPagina): string {
  return [d.status !== null ? `HTTP ${d.status}` : 'HTTP ?', d.tipoDeConteudo ?? 'sem content-type', `${d.tamanho} caracteres`].join(', ')
}

export class PaginaInesperadaDaInfraero extends Error {
  constructor(
    readonly idLicitacao: number,
    readonly diagnostico: DiagnosticoDaPagina
  ) {
    super(`Infraero: detalhe ${idLicitacao} fora do formato esperado (${resumoDoDiagnostico(diagnostico)})`)
    this.name = 'PaginaInesperadaDaInfraero'
  }
}

function comoPagina(baixada: string | PaginaDaInfraero): PaginaDaInfraero {
  return typeof baixada === 'string' ? { html: baixada } : baixada
}

export interface LeituraPorId {
  idLicitacao: number
  leitura: LeituraDoDetalheInfraero
}

export type MotivoDaParada = 'nao_encontrados' | 'limite' | 'falhas'

export interface ResultadoDaVarredura {
  lidas: LeituraPorId[]
  requisicoes: number
  naoEncontrados: number
  paginasInesperadas: number
  ultimaPaginaInesperada: DiagnosticoDaPagina | null
  falhas: string[]
  ultimoIdVisitado: number | null
  motivoDaParada: MotivoDaParada
}

export interface LimitesDaVarredura {
  maxRequisicoes: number
  naoEncontradosParaParar: number
  saltoDaSonda: number
}

export const LIMITES_PADRAO: LimitesDaVarredura = {
  maxRequisicoes: MAX_REQUISICOES_NOVAS,
  naoEncontradosParaParar: NAO_ENCONTRADOS_PARA_PARAR,
  saltoDaSonda: SALTO_DA_SONDA,
}

export function motivoCurto(err: unknown): string {
  if (err instanceof PaginaInesperadaDaInfraero) return `página inesperada: ${resumoDoDiagnostico(err.diagnostico)}`
  const e = err as { code?: unknown; response?: { status?: unknown }; message?: unknown }
  const partes = [
    typeof e?.response?.status === 'number' ? `HTTP ${e.response.status}` : '',
    typeof e?.code === 'string' ? e.code : '',
    !e?.response && typeof e?.message === 'string' ? e.message.replace(/https?:\/\/\S+/g, '').slice(0, 80) : '',
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' ') : 'erro desconhecido'
}

function erroTransitorio(err: unknown): boolean {
  const e = err as { isAxiosError?: boolean; response?: { status?: number } }
  if (!e?.isAxiosError) return false
  const status = e.response?.status
  return status === undefined || status === 429 || status >= 500
}

function interpretar(pagina: PaginaDaInfraero, idLicitacao: number): LeituraDoDetalheInfraero {
  try {
    return parseInfraeroDetalhe(pagina.html, idLicitacao)
  } catch {
    const diagnostico = diagnosticoDaPagina(pagina)
    console.warn(
      `[Infraero] Página inesperada no id ${idLicitacao}: ${resumoDoDiagnostico(diagnostico)}, URL final ${diagnostico.urlFinal ?? 'desconhecida'}, início: "${diagnostico.inicio}"`
    )
    throw new PaginaInesperadaDaInfraero(idLicitacao, diagnostico)
  }
}

export async function lerDetalhe(idLicitacao: number, rede: RedeDaInfraero): Promise<LeituraDoDetalheInfraero> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return interpretar(comoPagina(await rede.baixarDetalhe(idLicitacao)), idLicitacao)
    } catch (err) {
      if (tentativa >= TENTATIVAS_POR_ID || !erroTransitorio(err)) throw err
      await rede.esperar(ESPERA_ENTRE_TENTATIVAS_MS * 2 ** (tentativa - 1))
    }
  }
}

export function inicioDaVarredura(maiorIdColetado: number | null): number {
  if (maiorIdColetado === null) return INFRAERO_ID_INICIAL
  return Math.max(INFRAERO_ID_INICIAL, maiorIdColetado - RECUO_DO_CURSOR)
}

export async function varrerNovos(inicio: number, rede: RedeDaInfraero, limites: LimitesDaVarredura = LIMITES_PADRAO): Promise<ResultadoDaVarredura> {
  const lidas: LeituraPorId[] = []
  const falhas: string[] = []
  const lidosNasSondasDeFalha = new Set<number>()
  let requisicoes = 0
  let naoEncontrados = 0
  let paginasInesperadas = 0
  let ultimaPaginaInesperada: DiagnosticoDaPagina | null = null
  let seguidos = 0
  let falhasSeguidas = 0
  let alvoDaSonda: number | null = null
  let ultimoIdVisitado: number | null = null
  let id = inicio

  const fim = (motivoDaParada: MotivoDaParada): ResultadoDaVarredura => ({
    lidas,
    requisicoes,
    naoEncontrados,
    paginasInesperadas,
    ultimaPaginaInesperada,
    falhas,
    ultimoIdVisitado,
    motivoDaParada,
  })

  async function ler(idLicitacao: number): Promise<LeituraDoDetalheInfraero | null> {
    requisicoes++
    ultimoIdVisitado = Math.max(ultimoIdVisitado ?? idLicitacao, idLicitacao)
    try {
      const leitura = await lerDetalhe(idLicitacao, rede)
      falhasSeguidas = 0
      return leitura
    } catch (err) {
      falhasSeguidas++
      if (err instanceof PaginaInesperadaDaInfraero) {
        paginasInesperadas++
        ultimaPaginaInesperada = err.diagnostico
      }
      falhas.push(`${idLicitacao} (${motivoCurto(err)})`)
      return null
    }
  }

  async function sondarAposFalhas(aPartirDe: number): Promise<boolean> {
    for (let i = 0; i < SALTOS_DAS_SONDAS_APOS_FALHAS.length; i++) {
      if (requisicoes >= limites.maxRequisicoes || falhas.length >= MAX_FALHAS_NA_VARREDURA) return false
      await rede.esperar(ESPERA_ANTES_DA_SONDA_APOS_FALHAS_MS * 2 ** i)
      const alvo = aPartirDe + SALTOS_DAS_SONDAS_APOS_FALHAS[i]
      const leitura = await ler(alvo)
      if (!leitura) continue
      if (leitura.tipo === 'nao_encontrado') naoEncontrados++
      else {
        lidas.push({ idLicitacao: alvo, leitura })
        lidosNasSondasDeFalha.add(alvo)
      }
      return true
    }
    return false
  }

  while (requisicoes < limites.maxRequisicoes) {
    if (alvoDaSonda !== null && id === alvoDaSonda) {
      alvoDaSonda = null
      id++
      continue
    }
    if (lidosNasSondasDeFalha.has(id)) {
      id++
      continue
    }

    if (seguidos >= limites.naoEncontradosParaParar && alvoDaSonda === null) {
      const idDaSonda: number = id + limites.saltoDaSonda
      const sonda = await ler(idDaSonda)
      if (!sonda || sonda.tipo === 'nao_encontrado') {
        if (sonda) naoEncontrados++
        return fim(sonda ? 'nao_encontrados' : 'falhas')
      }
      lidas.push({ idLicitacao: idDaSonda, leitura: sonda })
      alvoDaSonda = idDaSonda
      seguidos = 0
      continue
    }

    const leitura = await ler(id)
    if (!leitura) {
      if (falhas.length >= MAX_FALHAS_NA_VARREDURA) return fim('falhas')
      if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR && !(await sondarAposFalhas(id))) return fim('falhas')
    } else if (leitura.tipo === 'nao_encontrado') {
      naoEncontrados++
      seguidos++
    } else {
      seguidos = 0
      lidas.push({ idLicitacao: id, leitura })
    }
    id++
  }

  return fim('limite')
}

export function motivoDaFalhaDaVarredura(r: Pick<ResultadoDaVarredura, 'falhas' | 'paginasInesperadas' | 'ultimaPaginaInesperada' | 'motivoDaParada'>): string | null {
  if (r.falhas.length === 0) return null
  const ids = r.falhas.slice(0, 12).join(', ')
  const pagina = r.ultimaPaginaInesperada
  const detalheDaPagina = pagina
    ? `; ${r.paginasInesperadas} página(s) fora do formato (portal bloqueando o acesso ou página diferente?), a última com ${resumoDoDiagnostico(pagina)}${pagina.urlFinal ? ` em ${pagina.urlFinal}` : ''}, começando por "${pagina.inicio.slice(0, 160)}"`
    : ''
  const cabeca =
    r.motivoDaParada === 'falhas'
      ? `Varredura da Infraero interrompida: ${r.falhas.length} falha(s), inclusive nos ids sondados mais à frente`
      : `Varredura da Infraero com ${r.falhas.length} falha(s)`
  return `${cabeca}${detalheDaPagina}. Ids: ${ids}`
}

export interface DesfechoDaColetaInfraero {
  motivoDaParada: MotivoDaParada
  respostasValidas: number
  falhas: string[]
  motivoDaFalha: string | null
}

export function statusDaColetaInfraero(
  resumo: DesfechoDaColetaInfraero | null,
  erroGeral: string | null
): { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; errorMsg?: string } {
  if (erroGeral || !resumo) return { status: 'FAILED', errorMsg: `Coleta da Infraero não terminou: ${erroGeral ?? 'erro desconhecido'}` }
  if (resumo.motivoDaParada === 'falhas' && resumo.respostasValidas === 0) {
    return { status: 'FAILED', errorMsg: resumo.motivoDaFalha ?? 'Varredura da Infraero interrompida sem nenhuma resposta válida do portal' }
  }
  if (resumo.falhas.length > 0) return { status: 'PARTIAL', errorMsg: resumo.motivoDaFalha ?? undefined }
  return { status: 'SUCCESS' }
}

export function deveGravarNova(tender: NormalizedTender, agora: Date): boolean {
  if (tender.situacao === 'SUSPENSA') return true
  if (tender.situacao !== 'ABERTA' || !tender.aberturaAt) return false
  return tender.aberturaAt.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export interface RegistroDaInfraero {
  id: string
  idLicitacao: number
  situacao: SituacaoEnum
  aberturaAt: Date | null
  situacaoCheckedAt: Date | null
}

export function escolherRevisitas(registros: RegistroDaInfraero[], jaLidos: Set<number>, agora: Date, limite = MAX_REVISITAS): RegistroDaInfraero[] {
  const corte = agora.getTime() - DIAS_DE_REVISITA_APOS_A_SESSAO * DIA_MS
  return registros
    .filter((r) => !jaLidos.has(r.idLicitacao))
    .filter((r) => r.situacao === 'SUSPENSA' || (r.situacao === 'ABERTA' && (!r.aberturaAt || r.aberturaAt.getTime() >= corte)))
    .sort((a, b) => (a.situacaoCheckedAt?.getTime() ?? -Infinity) - (b.situacaoCheckedAt?.getTime() ?? -Infinity) || a.idLicitacao - b.idLicitacao)
    .slice(0, limite)
}
