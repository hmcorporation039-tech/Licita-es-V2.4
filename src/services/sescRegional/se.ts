// ============================================================
// services/sescRegional/se.ts — Sesc Sergipe (sesc-se.com.br/licitacoes/)
// WordPress com cards server-side (article.card-item), filtro ?situacao=aberto,
// paginado em /licitacoes/page/N/ e ordenado por abertura decrescente. O
// rótulo "Aberto" permanece mesmo após a data passar (centenas de processos
// antigos), por isso a data de abertura também filtra. A listagem não traz
// horário, valor nem anexos (anexos exigem login); linkEdital = página do processo.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const out: NormalizedTender[] = []

  $('article.card-item').each((_, el) => {
    const card = $(el)
    const campos: Record<string, string> = {}
    card.find('.card-meta-detalhada p').each((__, p) => {
      const rotulo = limparTexto($(p).find('strong').first().text()).replace(/:$/, '').toLowerCase()
      campos[rotulo] = limparTexto($(p).clone().children('strong').remove().end().text())
    })

    const link = urlAbsoluta(card.find('.card-title a').attr('href'), ctx.url)
    const slug = link ? new URL(link).pathname.split('/').filter(Boolean).pop() : undefined
    const edital = campos['edital nº'] ?? campos['edital n°']
    const objeto = campos['objeto']
    const idLocal = slug ?? edital
    if (!idLocal || !objeto) return

    const aberturaAt = parseDataBr(campos['data de abertura'])
    if (!ehLicitacaoAtual({ situacao: campos['situação'], aberturaAt }, ctx.agora)) return

    out.push(
      montarTender(sescSE, {
        idLocal,
        objeto,
        modalidadeTexto: campos['modalidade'],
        numeroControle: edital,
        aberturaAt,
        linkEdital: link,
      })
    )
  })
  return out
}

// Páginas ordenadas por abertura decrescente: só segue adiante se esta página
// ainda tinha licitação atual.
function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  if (parse(html, ctx).length === 0) return []
  const $ = cheerio.load(html)
  const href = urlAbsoluta($('a.next.page-numbers').attr('href'), ctx.url)
  return href ? [href] : []
}

export const sescSE: SescUnidade = {
  uf: 'SE',
  nome: 'Sesc Sergipe',
  urls: () => ['https://sesc-se.com.br/licitacoes/?situacao=aberto'],
  parse,
  proximasPaginas,
}
