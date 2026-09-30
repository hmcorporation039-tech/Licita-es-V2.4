// ============================================================
// services/sescRegional/rn.ts — Sesc Rio Grande do Norte
// Fonte: https://sescrn.com.br/pagina-licitacoes/ (WordPress, HTML renderizado
// no servidor; a home e o menu apontam para esta página). Lista de cards
// `a.edital` (10 por página, ~28 páginas, mais recentes primeiro) com:
//   .n-edital  -> "PP 022/2026 – OBJETO..." (sigla+nº/ano + objeto)
//   .tag-edital -> situação ("Em andamento", "Encerrado"...)
//   .midle h4  -> data de abertura, texto livre ("30/09/2026 às 9h",
//                 "18/08/2026 a 17/08/2026", "13/08/2026 ÀS 9h (REPUBLICADO)")
//   .right h4  -> local (ou link da plataforma, ex.: Licitações-e)
// A listagem não traz valor nem anexos (ficam na página de detalhe /licitacoes/<slug>/).
// Só as 2 primeiras páginas interessam: o resto é histórico (2022-2025).
// ============================================================

import * as cheerio from 'cheerio'
import { ModalidadeEnum, NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

const BASE = 'https://sescrn.com.br/pagina-licitacoes/'

// Siglas usadas no início do título.
const SIGLAS: Record<string, ModalidadeEnum> = {
  PP: 'PREGAO_PRESENCIAL',
  PE: 'PREGAO_ELETRONICO',
  CD: 'CREDENCIAMENTO',
  CS: 'CREDENCIAMENTO',
  CC: 'OUTROS', // coleta de preços
}

function modalidadeDoTitulo(titulo: string): ModalidadeEnum {
  const sigla = titulo.match(/^(?:licita[cç][aã]o:?\s*)?([A-Z]{2})\b/)?.[1]
  if (sigla && SIGLAS[sigla]) return SIGLAS[sigla]
  const sufixo = titulo.match(/\d-([A-Z]{2})\b/)?.[1] // "24/00002-CS"
  if (sufixo && SIGLAS[sufixo]) return SIGLAS[sufixo]
  return detectarModalidade(titulo)
}

// "PP 022/2026 – OBJETO" -> { numero: '022/2026', objeto: 'OBJETO' }
function separarTitulo(titulo: string): { numero?: string; objeto: string } {
  const numero = titulo.match(/\d{1,5}[/.]\d{2,5}(?:-[A-Z]{2})?/)?.[0]
  const partes = titulo.split(/\s[–—-]\s/)
  let objeto = partes.length > 1 ? partes.slice(1).join(' – ') : titulo
  // "PE – 004.2026 CONDICIONADOR..." -> tira o número que sobrou no início
  objeto = objeto.replace(/^[\d./\s-]+(?=\D)/, '')
  return { numero, objeto }
}

// Data (e hora, se houver) de um trecho como "30/09/2026 às 9h" / "01/09/2023 - 10h".
function dataHora(trecho: string): Date | undefined {
  const base = parseDataBr(trecho)
  if (!base) return undefined
  const h = trecho.match(/\d{2}\/\d{2}\/\d{4}\D{0,8}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i)
  if (h) base.setHours(Number(h[1]), Number(h[2] ?? 0))
  return base
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('a.edital').each((_, el) => {
    const card = $(el)
    const link = urlAbsoluta(card.attr('href'), ctx.url)
    const titulo = limparTexto(card.find('.n-edital').first().text())
    if (!link || !titulo) return

    const situacao = limparTexto(card.find('.tag-edital').first().text())
    const textoData = limparTexto(card.find('.midle h4').first().text())
    // Pode vir um intervalo ("18/08/2026 a 17/08/2026"): a primeira é a abertura,
    // a última (se houver mais de uma) é o limite.
    const datas = (textoData.match(/\d{2}\/\d{2}\/\d{4}[^/]*?(?=\d{2}\/\d{2}\/\d{4}|$)/g) ?? [])
      .map(dataHora)
      .filter((d): d is Date => !!d)
    const aberturaAt = datas[0]
    const encerramentoAt =
      datas.length > 1 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : undefined

    if (!ehLicitacaoAtual({ situacao, aberturaAt, encerramentoAt }, ctx.agora)) return

    const slug = link.replace(/\/+$/, '').split('/').pop() ?? link
    const id = slug.slice(0, 80)
    if (vistos.has(id)) return
    vistos.add(id)

    const { numero, objeto } = separarTitulo(titulo)
    resultado.push(
      montarTender(sescRN, {
        idLocal: id,
        objeto,
        modalidade: modalidadeDoTitulo(titulo),
        numeroControle: numero,
        aberturaAt,
        encerramentoAt,
        linkEdital: link,
      })
    )
  })

  return resultado
}

// A página 1 já traz os processos mais novos; o restante da primeira centena
// de itens (página 2) ainda pode ter sessões em aberto. Mais que isso é histórico.
function proximasPaginas(_html: string, ctx: ContextoDeParse): string[] {
  return /\/page\/\d+/.test(ctx.url) ? [] : [`${BASE}page/2/`]
}

export const sescRN: SescUnidade = {
  uf: 'RN',
  nome: 'Sesc Rio Grande do Norte',
  urls: () => [BASE],
  parse,
  proximasPaginas,
}
