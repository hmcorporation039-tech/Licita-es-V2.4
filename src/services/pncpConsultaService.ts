// ============================================================
// services/pncpConsultaService.ts — Consulta de contratos no PNCP (API pública
// de consulta) para o Radar de oportunidades. Busca sob demanda, com cache em
// memória para não sobrecarregar o PNCP nem demorar na segunda consulta.
// Limites da API (verificados): período máx. 365 dias; página até 500 registros.
// ============================================================

import axios from 'axios'
import { ContratoPncp, janelasDeBusca, normalizarContrato, normalizarContratoDaBusca } from '../lib/radar'

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

// Só o órgão: a API de consulta IGNORA niFornecedor (conferido em 04/10/2026 — devolvia
// os 2 milhões de contratos do período, de qualquer empresa). Fornecedor: ver buscarContratosDoFornecedor.
interface Filtro {
  cnpjOrgao: string
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
        cnpjOrgao: filtro.cnpjOrgao,
      })
    } catch (err) {
      throw new PncpIndisponivelError(axios.isAxiosError(err) ? String(err.response?.status ?? err.code ?? 'sem resposta') : 'erro')
    }
    const r = (corpo && typeof corpo === 'object' ? corpo : {}) as { data?: unknown[]; totalPaginas?: number }
    for (const bruto of r.data ?? []) {
      const c = normalizarContrato(bruto)
      // Defesa: se a API voltar a ignorar o filtro, nada de outro órgão entra.
      if (c && c.orgao.cnpj === filtro.cnpjOrgao) contratos.push(c)
    }
    if (!r.totalPaginas || pagina >= r.totalPaginas) break
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(chave, { em: Date.now(), contratos })
  return contratos
}

// Contratos de um órgão nos últimos `janelas` períodos de ~1 ano.
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

// ---------- Contratos de um FORNECEDOR (dossiê do concorrente e Perfilador) ----------
// Busca do portal PNCP, a única fonte pública que filtra por fornecedor. Ela às vezes
// responde vazio/sem JSON: tentamos de novo antes de desistir. Mais recentes primeiro.
const BUSCA = 'https://pncp.gov.br/api/search/'
const TAMANHO_BUSCA = 500

export async function buscarContratosDoFornecedor(
  ni: string,
  opcoes: { maxPaginas?: number; buscar?: Buscador; esperaMs?: number } = {}
): Promise<ContratoPncp[]> {
  const buscar = opcoes.buscar ?? buscadorPadrao
  const maxPaginas = opcoes.maxPaginas ?? 6
  const chave = JSON.stringify(['fornecedor', ni, maxPaginas])
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.contratos

  const contratos: ContratoPncp[] = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    type Pagina = { items?: unknown[]; total?: number }
    let r: Pagina | null = null
    for (let tentativa = 1; tentativa <= 3 && !r; tentativa++) {
      try {
        const corpo = await buscar(BUSCA, { q: ni, tipos_documento: 'contrato', ordenacao: '-data', status: 'todos', pagina, tam_pagina: TAMANHO_BUSCA })
        if (corpo && typeof corpo === 'object' && Array.isArray((corpo as { items?: unknown }).items)) r = corpo as Pagina
      } catch {
        /* tenta de novo */
      }
      if (!r && tentativa < 3) await new Promise((ok) => setTimeout(ok, (opcoes.esperaMs ?? 1500) * tentativa))
    }
    if (!r) throw new PncpIndisponivelError('busca sem resposta')
    for (const bruto of r.items ?? []) {
      const c = normalizarContratoDaBusca(bruto)
      // A busca é por texto: só entra o que é DESTE fornecedor (o CNPJ pode aparecer em outro campo).
      if (c && c.fornecedor.ni === ni) contratos.push(c)
    }
    if ((r.items?.length ?? 0) < TAMANHO_BUSCA || pagina * TAMANHO_BUSCA >= (r.total ?? 0)) break
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(chave, { em: Date.now(), contratos })
  return contratos
}
