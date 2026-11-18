// ============================================================
// services/pncpItemsService.ts — Busca e normaliza os itens de
// uma contratação publicada no PNCP.
// Endpoint público, sem autenticação — descoberto empiricamente em
// 2026-08-12 (mesma família do endpoint de arquivos, /api/pncp/v1/orgaos).
//
// Observação: na prática a maioria dos órgãos não preenche o código
// de catálogo (CATMAT/CATSER) ao publicar o item — o campo vem null
// com bastante frequência. Descrição/quantidade/valor sempre vêm.
// ============================================================

import axios from 'axios'
import { NormalizedTenderItem } from '../types'
import { assertIdentificadorCompraPncp } from '../lib/pncpIdentificador'

export interface PNCPItemRaw {
  numeroItem: number
  descricao: string
  informacaoComplementar: string | null
  criterioJulgamentoNome: string | null
  materialOuServico: 'M' | 'S' | string
  quantidade: number
  unidadeMedida: string
  valorUnitarioEstimado: number | null
  valorTotal: number | null
  catalogoCodigoItem: string | null
}

export async function fetchPNCPItens(
  cnpj: string,
  anoCompra: number | string,
  sequencialCompra: number | string
): Promise<NormalizedTenderItem[]> {
  // Sem `pagina`/`tamanhoPagina` o PNCP devolve só os 10 primeiros itens — por isso pagina.
  const { itens, completo } = await fetchPNCPItensBrutos(cnpj, anoCompra, sequencialCompra, {
    maxPaginas: MAX_PAGINAS_DE_ITENS,
  })
  if (!completo) {
    console.warn(
      `[pncpItems] compra ${cnpj}/${anoCompra}/${sequencialCompra} tem mais de ${itens.length} itens; guardando só os primeiros ${itens.length}`
    )
  }
  return (itens as unknown as PNCPItemRaw[]).map(normalizarItemDoPncp)
}

// Teto de páginas na coleta: 20 × 500 = 10.000 itens — bem acima de qualquer compra real.
const MAX_PAGINAS_DE_ITENS = 20

export function normalizarItemDoPncp(item: PNCPItemRaw): NormalizedTenderItem {
  return {
    numeroItem: item.numeroItem,
    descricao: item.descricao ?? '',
    descricaoDetalhada: item.informacaoComplementar || undefined,
    criterioJulgamento: item.criterioJulgamentoNome || undefined,
    catmatCode: item.materialOuServico === 'M' ? item.catalogoCodigoItem ?? undefined : undefined,
    catserCode: item.materialOuServico === 'S' ? item.catalogoCodigoItem ?? undefined : undefined,
    unidadeMedida: item.unidadeMedida,
    quantidade: item.quantidade ?? undefined,
    valorUnitario: item.valorUnitarioEstimado ?? undefined,
    valorTotal: item.valorTotal ?? undefined,
  }
}

export interface OpcoesDaConsulta {
  timeoutMs?: number
  signal?: AbortSignal
}

// O /itens devolve 10 por página se não pedir; 500 por página cobre quase toda compra numa chamada.
const ITENS_POR_PAGINA = 500

/** Itens crus da compra, paginando (até `maxPaginas` páginas de 500). Para "O que o contrato pede". */
export async function fetchPNCPItensBrutos(
  cnpj: string,
  anoCompra: number | string,
  sequencialCompra: number | string,
  opcoes: OpcoesDaConsulta & { maxPaginas?: number } = {}
): Promise<{ itens: Record<string, unknown>[]; completo: boolean }> {
  assertIdentificadorCompraPncp(cnpj, anoCompra, sequencialCompra)
  const maxPaginas = opcoes.maxPaginas ?? 2
  const itens: Record<string, unknown>[] = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${sequencialCompra}/itens`
    const response = await axios.get<unknown>(url, {
      params: { pagina, tamanhoPagina: ITENS_POR_PAGINA },
      timeout: opcoes.timeoutMs ?? 20_000,
      signal: opcoes.signal,
    })
    const lote = Array.isArray(response.data) ? (response.data as Record<string, unknown>[]) : []
    itens.push(...lote)
    if (lote.length < ITENS_POR_PAGINA) return { itens, completo: true }
  }
  return { itens, completo: false }
}

/** Resultados (fornecedor e valor homologado) de um item da compra. */
export async function fetchPNCPResultadosDoItem(
  cnpj: string,
  anoCompra: number | string,
  sequencialCompra: number | string,
  numeroItem: number,
  opcoes: OpcoesDaConsulta = {}
): Promise<unknown[]> {
  assertIdentificadorCompraPncp(cnpj, anoCompra, sequencialCompra)
  if (!Number.isInteger(numeroItem) || numeroItem < 1) throw new Error('Número de item inválido')
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}/resultados`
  const response = await axios.get<unknown>(url, { timeout: opcoes.timeoutMs ?? 20_000, signal: opcoes.signal })
  return Array.isArray(response.data) ? response.data : []
}
