import { API_URL } from './api'
import type { Limites } from './adminTypes'

export interface PlanoPublico {
  codigo: string
  nome: string
  descricao: string | null
  limites: Limites
  precoMensalCentavos: number | null
}

export interface PlanosResposta {
  trialDias: number
  planos: PlanoPublico[]
}

export interface EstatisticasPublicas {
  abertas: number
  fontes: number
  atualizadoEm: string | null
}

export interface AmostraDaVitrine {
  objeto: string
  orgao: string
  local: string
  prazo: string | null
  fonte: string
}

export interface RespostaDaVitrine {
  total: number
  amostras: AmostraDaVitrine[]
}

const DEZ_MINUTOS_EM_SEGUNDOS = 600
const ESPERA_MAXIMA_MS = 5000

async function buscarPublico<T>(caminho: string): Promise<T | null> {
  try {
    const resposta = await fetch(`${API_URL}${caminho}`, {
      next: { revalidate: DEZ_MINUTOS_EM_SEGUNDOS },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    })
    if (!resposta.ok) return null
    return (await resposta.json()) as T
  } catch {
    return null
  }
}

function estatisticasValidas(dados: EstatisticasPublicas | null): EstatisticasPublicas | null {
  if (!dados || typeof dados.abertas !== 'number' || typeof dados.fontes !== 'number') return null
  if (dados.abertas <= 0 || dados.fontes <= 0) return null
  return dados
}

function planosValidos(dados: PlanosResposta | null): PlanosResposta | null {
  if (!dados || !Array.isArray(dados.planos)) return null
  return dados
}

export async function buscarEstatisticas(): Promise<EstatisticasPublicas | null> {
  return estatisticasValidas(await buscarPublico<EstatisticasPublicas>('/api/public/estatisticas'))
}

export async function buscarPlanos(): Promise<PlanosResposta | null> {
  return planosValidos(await buscarPublico<PlanosResposta>('/api/public/plans'))
}
