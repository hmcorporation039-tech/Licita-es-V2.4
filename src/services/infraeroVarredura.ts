import { SituacaoEnum } from '@prisma/client'
import { infraeroClient } from '../lib/httpClient'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { NormalizedTender } from '../types'
import { CAMINHO_DO_DETALHE_INFRAERO, LeituraDoDetalheInfraero, parseInfraeroDetalhe } from './infraeroParser'
import { decodificarHtml } from './sescRegional/tipos'

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

const DIA_MS = 86_400_000

export interface RedeDaInfraero {
  baixarDetalhe: (idLicitacao: number) => Promise<string>
  esperar: (ms: number) => Promise<void>
}

export const REDE_DA_INFRAERO: RedeDaInfraero = {
  baixarDetalhe: async (idLicitacao) => {
    const resposta = await infraeroClient.get<ArrayBuffer>(CAMINHO_DO_DETALHE_INFRAERO, {
      params: { idLicitacao },
      responseType: 'arraybuffer',
    })
    return decodificarHtml(Buffer.from(resposta.data), String(resposta.headers['content-type'] ?? ''))
  },
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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

export async function lerDetalhe(idLicitacao: number, rede: RedeDaInfraero): Promise<LeituraDoDetalheInfraero> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return parseInfraeroDetalhe(await rede.baixarDetalhe(idLicitacao), idLicitacao)
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
  let requisicoes = 0
  let naoEncontrados = 0
  let seguidos = 0
  let falhasSeguidas = 0
  let alvoDaSonda: number | null = null
  let ultimoIdVisitado: number | null = null
  let id = inicio

  const fim = (motivoDaParada: MotivoDaParada): ResultadoDaVarredura => ({ lidas, requisicoes, naoEncontrados, falhas, ultimoIdVisitado, motivoDaParada })

  async function ler(idLicitacao: number): Promise<LeituraDoDetalheInfraero | null> {
    requisicoes++
    ultimoIdVisitado = Math.max(ultimoIdVisitado ?? idLicitacao, idLicitacao)
    try {
      const leitura = await lerDetalhe(idLicitacao, rede)
      falhasSeguidas = 0
      return leitura
    } catch (err) {
      falhasSeguidas++
      falhas.push(`${idLicitacao} (${motivoCurto(err)})`)
      return null
    }
  }

  while (requisicoes < limites.maxRequisicoes) {
    if (alvoDaSonda !== null && id === alvoDaSonda) {
      alvoDaSonda = null
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
      if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) return fim('falhas')
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
