// ============================================================
// services/pncpConsultaService.ts — Consulta de contratos no PNCP (API pública
// de consulta) para o Radar de oportunidades. Busca sob demanda, com cache em
// memória para não sobrecarregar o PNCP nem demorar na segunda consulta.
// Limites da API (verificados): período máx. 365 dias; página até 500 registros.
// ============================================================

import axios from 'axios'
import { ContratoPncp, janelasDeBusca, normalizarContrato } from '../lib/radar'

const BASE = 'https://pncp.gov.br/api/consulta/v1'
const TAMANHO_PAGINA = 500
const CACHE_MS = 15 * 60 * 1000
const CACHE_MAX = 200

export type Buscador = (url: string, params: Record<string, string | number>) => Promise<unknown>

const buscadorPadrao: Buscador = async (url, params) => {
  const r = await axios.get(url, { params, timeout: 45_000, headers: { Accept: 'application/json' } })
  return r.data
}

const cache = new Map<string, { em: number; contratos: ContratoPncp[] }>()

export function limparCache(): void {
  cache.clear()
}

export class PncpIndisponivelError extends Error {
  constructor(detalhe: string) {
    super(`O PNCP não respondeu à consulta (${detalhe}). Tente novamente em instantes.`)
  }
}

interface Filtro {
  cnpjOrgao?: string
  niFornecedor?: string
}

async function buscarJanela(filtro: Filtro, inicial: string, final: string, maxPaginas: number, buscar: Buscador): Promise<ContratoPncp[]> {
  const chave = JSON.stringify([filtro, inicial, final, maxPaginas])
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.contratos

  const contratos: ContratoPncp[] = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    let corpo: unknown
    try {
      corpo = await buscar(`${BASE}/contratos`, {
        dataInicial: inicial,
        dataFinal: final,
        pagina,
        tamanhoPagina: TAMANHO_PAGINA,
        ...(filtro.cnpjOrgao ? { cnpjOrgao: filtro.cnpjOrgao } : {}),
        ...(filtro.niFornecedor ? { niFornecedor: filtro.niFornecedor } : {}),
      })
    } catch (err) {
      throw new PncpIndisponivelError(axios.isAxiosError(err) ? String(err.response?.status ?? err.code ?? 'sem resposta') : 'erro')
    }
    const r = (corpo && typeof corpo === 'object' ? corpo : {}) as { data?: unknown[]; totalPaginas?: number }
    for (const bruto of r.data ?? []) {
      const c = normalizarContrato(bruto)
      if (c) contratos.push(c)
    }
    if (!r.totalPaginas || pagina >= r.totalPaginas) break
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(chave, { em: Date.now(), contratos })
  return contratos
}

// Contratos de um órgão ou de um fornecedor nos últimos `janelas` períodos de ~1 ano.
export async function buscarContratos(
  filtro: Filtro,
  hoje: string,
  opcoes: { janelas?: number; maxPaginas?: number; buscar?: Buscador } = {}
): Promise<ContratoPncp[]> {
  const buscar = opcoes.buscar ?? buscadorPadrao
  const todas: ContratoPncp[] = []
  for (const j of janelasDeBusca(hoje, opcoes.janelas ?? 2)) {
    todas.push(...(await buscarJanela(filtro, j.inicial, j.final, opcoes.maxPaginas ?? 6, buscar)))
  }
  return todas
}
