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

interface PNCPItemRaw {
  numeroItem: number
  descricao: string
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
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${sequencialCompra}/itens`
  const response = await axios.get<PNCPItemRaw[]>(url, { timeout: 20_000 })
  const raw = Array.isArray(response.data) ? response.data : []

  return raw.map((item) => ({
    numeroItem: item.numeroItem,
    descricao: item.descricao ?? '',
    catmatCode: item.materialOuServico === 'M' ? item.catalogoCodigoItem ?? undefined : undefined,
    catserCode: item.materialOuServico === 'S' ? item.catalogoCodigoItem ?? undefined : undefined,
    unidadeMedida: item.unidadeMedida,
    quantidade: item.quantidade ?? undefined,
    valorUnitario: item.valorUnitarioEstimado ?? undefined,
    valorTotal: item.valorTotal ?? undefined,
  }))
}
