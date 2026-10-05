// ============================================================
// services/pesquisaDePrecosService.ts — Preços que o governo pagou por um item de catálogo
// (CATMAT = material, CATSER = serviço), da API pública de Pesquisa de Preços do
// Compras.gov.br. Verificado em 05/10/2026: página de 10 a 500 registros; filtros `estado`,
// `dataCompraInicio` e `dataCompraFim` funcionam. Cache em memória de 30 min.
// ============================================================

import axios from 'axios'
import { EstatisticasDePreco, RegistroDePreco, estatisticasDePrecos, normalizarRegistroDePreco } from '../lib/precosDeMercado'

const BASE = 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco'
const TAMANHO_PAGINA = 500
const MAX_PAGINAS = 4
const CACHE_MS = 30 * 60 * 1000
const CACHE_MAX = 300

export type TipoDeItem = 'MATERIAL' | 'SERVICO'
export type BuscadorDePrecos = (url: string, params: Record<string, string | number>) => Promise<unknown>

const buscadorPadrao: BuscadorDePrecos = async (url, params) => {
  const r = await axios.get(url, { params, timeout: 45_000, headers: { Accept: 'application/json' } })
  return r.data
}

export class PrecosIndisponiveisError extends Error {
  constructor() {
    super('A base de preços do governo não respondeu. Tente novamente em instantes ou informe o preço à mão.')
  }
}

export interface PesquisaDePrecos {
  codigo: string
  tipo: TipoDeItem
  filtro: { uf: string | null; meses: number }
  totalDeCompras: number
  estatisticas: EstatisticasDePreco | null
  /** As compras mais recentes, para o usuário conferir de onde vem o número. */
  recentes: RegistroDePreco[]
}

const cache = new Map<string, { em: number; valor: PesquisaDePrecos }>()
export function limparCachePrecos(): void {
  cache.clear()
}

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function pesquisarPrecos(
  entrada: { tipo: TipoDeItem; codigo: string; uf?: string | null; meses?: number },
  opcoes: { buscar?: BuscadorDePrecos; agora?: Date } = {}
): Promise<PesquisaDePrecos> {
  const buscar = opcoes.buscar ?? buscadorPadrao
  const agora = opcoes.agora ?? new Date()
  const codigo = entrada.codigo.replace(/\D/g, '')
  const meses = entrada.meses ?? 12
  const uf = entrada.uf ? entrada.uf.toUpperCase() : null
  const chave = JSON.stringify([entrada.tipo, codigo, uf, meses])
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.valor

  const inicio = new Date(agora)
  inicio.setMonth(inicio.getMonth() - meses)
  const url = entrada.tipo === 'MATERIAL' ? `${BASE}/1_consultarMaterial` : `${BASE}/3_consultarServico`
  const base: Record<string, string | number> =
    entrada.tipo === 'MATERIAL' ? { tipo: 'codigoItemCatalogo', codigo } : { codigoItemCatalogo: codigo }

  const registros: RegistroDePreco[] = []
  let total = 0
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    let corpo: unknown
    let ok = false
    for (let tentativa = 1; tentativa <= 2 && !ok; tentativa++) {
      try {
        corpo = await buscar(url, {
          ...base,
          pagina,
          tamanhoPagina: TAMANHO_PAGINA,
          dataCompraInicio: dataISO(inicio),
          dataCompraFim: dataISO(agora),
          ...(uf ? { estado: uf } : {}),
        })
        ok = !!corpo && typeof corpo === 'object' && Array.isArray((corpo as { resultado?: unknown }).resultado)
      } catch {
        /* tenta de novo */
      }
    }
    if (!ok) throw new PrecosIndisponiveisError()
    const r = corpo as { resultado: unknown[]; totalRegistros?: number; totalPaginas?: number }
    total = r.totalRegistros ?? total
    for (const bruto of r.resultado) {
      const reg = normalizarRegistroDePreco(bruto)
      if (reg) registros.push(reg)
    }
    if (!r.totalPaginas || pagina >= r.totalPaginas) break
  }

  const valor: PesquisaDePrecos = {
    codigo,
    tipo: entrada.tipo,
    filtro: { uf, meses },
    totalDeCompras: total || registros.length,
    estatisticas: estatisticasDePrecos(registros.map((r) => r.precoUnitario)),
    recentes: [...registros].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 5),
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(chave, { em: Date.now(), valor })
  return valor
}
