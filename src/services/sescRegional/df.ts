// ============================================================
// services/sescRegional/df.ts — Sesc Distrito Federal
// Fonte: https://www.sescdf.com.br/portal-de-compras (Liferay, HTML renderizado
// no servidor — NÃO é SPA; não há API JSON). Cards `a.tender-card` com:
//   badges (modalidade + situação), código ("PREGÃO ELETRÔNICO Nº 43/2026"),
//   objeto (h3), resumo dos anexos (texto truncado) e data de publicação.
// A listagem NÃO traz data de sessão/abertura — só a de publicação — então o
// filtro de "atual" depende da situação (badge) E da recência da publicação
// (o portal mantém processos de 2022-2025 como "Em andamento"). Paginação: ?delta=60&start=N.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  publicadaRecentemente,
  urlAbsoluta,
} from './tipos'

const BASE = 'https://www.sescdf.com.br/portal-de-compras'
const POR_PAGINA = 60

// Slug estável da página da licitação no Liferay (/w/<slug>), sem query string.
function idDoLink(href: string): string {
  let path = href
  try {
    path = decodeURIComponent(new URL(href).pathname)
  } catch {
    // mantém o href bruto
  }
  const idx = path.indexOf('/w/')
  const slug = idx >= 0 ? path.slice(idx + 3) : path
  return slug.slice(0, 90)
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('a.tender-card').each((_, el) => {
    const card = $(el)
    const link = urlAbsoluta(card.attr('href'), ctx.url)
    const objeto = limparTexto(card.find('h3').first().text())
    if (!link || !objeto) return

    const badges = card
      .find('.badge')
      .map((__, b) => limparTexto($(b).text()))
      .get()
      .filter(Boolean)
    // Os badges às vezes vêm trocados (ex.: "Encerrado|Em andamento"): qualquer
    // estado final em qualquer badge descarta.
    const situacao = badges.join(' | ')

    const codigo = limparTexto(card.find('span.d-block').first().text())
    const publicadoAt = parseDataBr(card.find('time').first().text())

    if (!ehLicitacaoAtual({ situacao }, ctx.agora)) return
    // Sem data de sessão na listagem, e o portal mantém processos de anos atrás
    // como "Em andamento": só vale o que foi publicado recentemente.
    if (!publicadaRecentemente(publicadoAt, ctx.agora)) return

    const id = idDoLink(link)
    if (vistos.has(id)) return
    vistos.add(id)

    const numero = (codigo || objeto).match(/(\d+)\s*\/\s*(\d{4})/)
    resultado.push(
      montarTender(sescDF, {
        idLocal: id,
        objeto,
        modalidade: detectarModalidade(`${badges[0] ?? ''} ${codigo}`),
        numeroControle: numero ? `${numero[1]}/${numero[2]}` : codigo || undefined,
        publicadoAt,
        linkEdital: link,
      })
    )
  })

  return resultado
}

function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()
  $('[class*=paginat] a[href*="start="]').each((_, a) => {
    const url = urlAbsoluta($(a).attr('href'), ctx.url)
    if (url && url.includes(`delta=${POR_PAGINA}`)) urls.add(url)
  })
  return [...urls]
}

export const sescDF: SescUnidade = {
  uf: 'DF',
  nome: 'Sesc Distrito Federal',
  urls: () => [`${BASE}?delta=${POR_PAGINA}`],
  parse,
  proximasPaginas,
}
