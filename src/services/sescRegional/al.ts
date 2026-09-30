// ============================================================
// services/sescRegional/al.ts — Sesc Alagoas
// Fonte: https://www.sescalagoas.com.br/licitacoes/abertas
// (a URL /licitacoes-abertas/ é uma página genérica, sem a lista).
// HTML server-side: um <article class="item"> por licitação dentro de
// #bidding .pagination-objects (a paginação é só client-side, tudo vem no DOM).
// Cada item traz título, resumo do objeto e <li> "Rótulo: valor" (Edital,
// Modalidade, Nº Banco do Brasil, Publicação, Abertura). Anexos (PDFs) só
// existem na página de detalhe ("VEJA MAIS"), por isso linkEdital aponta para ela.
// Listas /licitacoes/andamento, /encerradas etc. NÃO são coletadas.
// ============================================================

import * as cheerio from 'cheerio'
import { parseDataBr } from '../../lib/scrapingHelpers'
import { NormalizedTender } from '../../types'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

const URL_ABERTAS = 'https://www.sescalagoas.com.br/licitacoes/abertas'

function parseAl(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const tenders: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('#bidding .pagination-objects article.item').each((_, art) => {
    const el = $(art)
    const titulo = limparTexto(el.find('h2').first().text())
    const resumo = limparTexto(el.find('strong').first().text())

    const campos: Record<string, string> = {}
    el.find('ul li').each((__, li) => {
      const t = limparTexto($(li).text())
      const i = t.indexOf(':')
      if (i > 0) campos[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim()
    })

    const link = urlAbsoluta(el.find('a.btn').first().attr('href'), ctx.url)
    const edital = campos['edital']
    const idLocal = edital || link?.split('/').pop() || ''
    if (!idLocal || vistos.has(idLocal)) return
    const objeto = resumo || titulo
    if (!objeto) return

    const aberturaAt = parseDataBr(campos['abertura'])
    if (!ehLicitacaoAtual({ aberturaAt }, ctx.agora)) return

    vistos.add(idLocal)
    const t = montarTender(sescAL, {
      idLocal,
      objeto,
      modalidadeTexto: campos['modalidade'] || titulo,
      numeroControle: edital,
      aberturaAt,
      publicadoAt: parseDataBr(campos['publicação'] ?? campos['publicacao']),
      linkEdital: link,
    })
    t.rawJson = { ...(t.rawJson as object), titulo, numeroBancoBrasil: campos['nº banco do brasil'] }
    tenders.push(t)
  })

  return tenders
}

export const sescAL: SescUnidade = {
  uf: 'AL',
  nome: 'Sesc Alagoas',
  urls: () => [URL_ABERTAS],
  parse: parseAl,
}
