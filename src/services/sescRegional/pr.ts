// ============================================================
// services/sescRegional/pr.ts — Sesc Paraná
// Página pública: https://www.sescpr.com.br/licitacoes/ — a lista é desenhada
// por JavaScript (plugin sesc-licitacoes-view) a partir de uma API JSON do
// próprio site, que só aceita POST:
//   POST https://www.sescpr.com.br/wp-json/sclc-view/v1/dados
//   {"action":"get-editais","data":{"page":N,"perPage":10}}
// O servidor fixa 10 itens por página (ignora perPage maior) e ordena por data
// de abertura decrescente — as licitações a realizar vêm primeiro.
//
// Status (action get-status, publicado pela própria API):
//   10 Aguardando Abertura | 14 Em andamento (sessão já iniciada) |
//   13 Revogado/Anulado | 15 Finalizado | 99 Não informado
// "Atual" = status 10 (a disputa ainda não aconteceu) E abertura de hoje em diante.
//
// A paginação vai no FRAGMENTO da URL (#pagina=N) — o fragmento não é enviado
// ao servidor, mas torna cada página uma "URL" distinta para o coletor.
//
// Os anexos exigem um cadastro (flShowForm) antes do download; por isso só
// guardamos o título deles e apontamos linkEdital para a página pública.
// ============================================================

import { NormalizedTender } from '../../types'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
} from './tipos'

const PAGINA_PUBLICA = 'https://www.sescpr.com.br/licitacoes/'
const API = 'https://www.sescpr.com.br/wp-json/sclc-view/v1/dados'
const STATUS_AGUARDANDO_ABERTURA = 10

interface EditalPR {
  idLicitacao: number
  dsEdital?: string | null
  dsProtocolo?: string | null
  dsObjeto?: string | null
  dsModalidade?: string | null
  dtAbertura?: string | null // 'YYYY-MM-DD'
  hrAbertura?: string | null // 'HH:MM:SS'
  dtPublicacao?: string | null
  stLicitacao?: number | null
  lstArquivo?: { dsNome?: string | null; dsCaminho?: string | null }[] | null
}

interface RespostaPR {
  data?: EditalPR[]
  meta?: { pagination?: { page?: number; total_pages?: number } }
}

function paginaDaUrl(url: string): number {
  const n = Number(url.match(/#pagina=(\d+)/)?.[1])
  return Number.isInteger(n) && n > 0 ? n : 1
}

function urlDaPagina(pagina: number): string {
  return `${API}#pagina=${pagina}`
}

// 'YYYY-MM-DD' (+ 'HH:MM:SS') -> Date local. undefined se inválido.
function dataHora(data?: string | null, hora?: string | null): Date | undefined {
  const m = data?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return undefined
  const h = hora?.match(/^(\d{2}):(\d{2})/)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h?.[1] ?? 0), Number(h?.[2] ?? 0))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function lerResposta(texto: string): RespostaPR {
  try {
    return JSON.parse(texto) as RespostaPR
  } catch {
    // Não devolvemos [] em silêncio: um corpo que não é JSON (ex.: página de
    // erro/bloqueio) precisa aparecer como falha da unidade no log do coletor.
    throw new Error('Sesc PR: resposta da API não é JSON válido')
  }
}

function atual(e: EditalPR, agora: Date): boolean {
  if (e.stLicitacao !== STATUS_AGUARDANDO_ABERTURA) return false
  return ehLicitacaoAtual({ aberturaAt: dataHora(e.dtAbertura, e.hrAbertura) }, agora)
}

function parse(texto: string, ctx: ContextoDeParse): NormalizedTender[] {
  const resposta = lerResposta(texto)
  const resultado: NormalizedTender[] = []

  for (const e of resposta.data ?? []) {
    const objeto = limparTexto(e.dsObjeto)
    if (!e.idLicitacao || !objeto || !atual(e, ctx.agora)) continue

    const aberturaAt = dataHora(e.dtAbertura, e.hrAbertura)
    resultado.push(
      montarTender(sescPR, {
        idLocal: String(e.idLicitacao),
        objeto,
        modalidadeTexto: limparTexto(e.dsModalidade),
        numeroControle: limparTexto(e.dsEdital ?? e.dsProtocolo) || undefined,
        aberturaAt,
        encerramentoAt: aberturaAt,
        publicadoAt: dataHora(e.dtPublicacao),
        linkEdital: PAGINA_PUBLICA,
        anexos: (e.lstArquivo ?? [])
          .filter((a) => limparTexto(a.dsNome))
          .map((a) => ({ uri: PAGINA_PUBLICA, titulo: limparTexto(a.dsNome) })),
      })
    )
  }
  return resultado
}

// A lista vem ordenada por abertura decrescente: só vale pedir a página
// seguinte se o ÚLTIMO item desta ainda é atual (senão o resto é histórico).
function proximasPaginas(texto: string, ctx: ContextoDeParse): string[] {
  const resposta = lerResposta(texto)
  const itens = resposta.data ?? []
  const pagina = resposta.meta?.pagination?.page ?? paginaDaUrl(ctx.url)
  const total = resposta.meta?.pagination?.total_pages ?? pagina
  const ultimo = itens[itens.length - 1]
  if (!ultimo || pagina >= total) return []
  const ultimaAbertura = dataHora(ultimo.dtAbertura, ultimo.hrAbertura)
  const aindaHaAtuais = ultimaAbertura ? ehLicitacaoAtual({ aberturaAt: ultimaAbertura }, ctx.agora) : false
  return aindaHaAtuais ? [urlDaPagina(pagina + 1)] : []
}

export const sescPR: SescUnidade = {
  uf: 'PR',
  nome: 'Sesc Paraná',
  urls: () => [urlDaPagina(1)],
  // O Referer da página pública é o que o próprio site envia à API.
  sessaoUrl: PAGINA_PUBLICA,
  requisicaoPost: (url) => ({
    corpo: JSON.stringify({ action: 'get-editais', data: { page: paginaDaUrl(url), perPage: 10 } }),
  }),
  parse,
  proximasPaginas,
}
