// ============================================================
// services/sescRegional/mg.ts — Sesc em Minas
// Fonte: https://sescmg.com.br/licitacoes/ (WordPress + tema próprio, HTML
// renderizado no servidor). A listagem aceita ?situacao_licitacao=em-andamento
// e vem ordenada por publicação (desc). Cada item é um `div.shadow-sm` com:
// data de publicação, código ("PE 0079.26"), objeto e link "Ver detalhes"
// (/licitacao/<slug>/).
// A listagem NÃO traz data da sessão nem a situação (a sessão só aparece na
// página de detalhe), e o filtro "em andamento" ainda devolve processos de
// 2022-2024. Por isso "atual" = em andamento (filtro da URL) E publicada nos
// últimos 60 dias. Paginação: /licitacoes/page/N/?situacao_licitacao=...
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  limparTexto,
  montarTender,
  publicadaRecentemente,
  urlAbsoluta,
} from './tipos'

const URL_LISTA = 'https://sescmg.com.br/licitacoes/?situacao_licitacao=em-andamento'

// Prefixo do código do processo -> texto de modalidade.
const MODALIDADES: Record<string, string> = {
  PE: 'Pregão Eletrônico',
  PP: 'Pregão Presencial',
  CR: 'Credenciamento',
  CC: 'Concorrência',
  CO: 'Concorrência',
  CV: 'Convite',
  CP: 'Chamamento Público',
}

function itens($: cheerio.CheerioAPI) {
  return $('div.shadow-sm')
    .filter((_, el) => $(el).find('a[href*="/licitacao/"]').length > 0)
    .toArray()
}

function slugDoLink(link: string): string {
  try {
    return decodeURIComponent(new URL(link).pathname).replace(/^\/licitacao\//, '').replace(/\/+$/, '')
  } catch {
    return link
  }
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  for (const el of itens($)) {
    const card = $(el)
    const a = card.find('a[href*="/licitacao/"]').first()
    const link = urlAbsoluta(a.attr('href'), ctx.url)
    const codigo = limparTexto(card.find('h5').first().text())
    const objeto = limparTexto(card.find('span.text-black-50').first().text()).replace(/^[-–]\s*/, '')
    const publicadoAt = parseDataBr(card.find('small').first().text())
    if (!link || !objeto) continue
    if (!publicadaRecentemente(publicadoAt, ctx.agora)) continue

    const id = slugDoLink(link)
    if (vistos.has(id)) continue
    vistos.add(id)

    const sigla = codigo.match(/^([A-Z]{2,3})\b/)?.[1]
    const textoModalidade = (sigla && MODALIDADES[sigla]) || `${codigo} ${objeto}`
    resultado.push(
      montarTender(sescMG, {
        idLocal: id,
        objeto,
        modalidade: detectarModalidade(textoModalidade),
        numeroControle: codigo || undefined,
        publicadoAt,
        linkEdital: link,
      })
    )
  }
  return resultado
}

// Segue para a página seguinte só enquanto TODOS os itens da atual são recentes
// (a lista é ordenada por publicação decrescente).
function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  const datas = itens($).map((el) => parseDataBr($(el).find('small').first().text()))
  if (datas.length === 0 || !datas.every((d) => publicadaRecentemente(d, ctx.agora))) return []
  const proxima = urlAbsoluta($('a.next.page-numbers').first().attr('href'), ctx.url)
  return proxima ? [proxima] : []
}

export const sescMG: SescUnidade = {
  uf: 'MG',
  nome: 'Sesc em Minas',
  urls: () => [URL_LISTA],
  parse,
  proximasPaginas,
}
