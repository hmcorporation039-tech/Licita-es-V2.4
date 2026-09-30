// ============================================================
// services/sescRegional/sc.ts — Sesc Santa Catarina
// Fonte: https://www.sesc-sc.com.br/sobre-o-sesc/licitacoes
// HTML server-side, página única (sem paginação), um bloco por licitação:
//   <span id="lic_<id>" class="aba_licitacao"><p><b>NÚMERO</b> | OBJETO | MODALIDADE | SITUAÇÃO</p></span>
//   <div class="open-close"> Data abertura / Valor Estimado / links dos anexos </div>
// Processos antigos ficam em adm.sesc-sc.com.br/editais e NÃO são coletados.
// A disputa acontece no Licitações-e (Banco do Brasil); o "Localizador" vem
// no próprio número do edital.
// ============================================================

import * as cheerio from 'cheerio'
import { parseDataBr, parseValorBr } from '../../lib/scrapingHelpers'
import { NormalizedTender } from '../../types'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

const URL_LICITACOES = 'https://www.sesc-sc.com.br/sobre-o-sesc/licitacoes'

function parseSc(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const tenders: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('span.aba_licitacao[id^="lic_"]').each((_, span) => {
    const el = $(span)
    const id = (el.attr('id') ?? '').replace(/^lic_/, '')
    if (!id || vistos.has(id)) return

    const cabecalho = el.find('p').first()
    const numero = limparTexto(cabecalho.find('b').first().text())
    // "NÚMERO | OBJETO | MODALIDADE | SITUAÇÃO" — o objeto pode conter "|",
    // por isso modalidade e situação são lidas de trás para frente.
    const resto = limparTexto(cabecalho.clone().children('b, i').remove().end().text())
    const partes = resto
      .replace(/^\|\s*/, '')
      .split(/\s+\|\s+/)
      .map((p) => p.trim())
    if (partes.length < 3) return
    const situacao = partes[partes.length - 1]
    const modalidadeTexto = partes[partes.length - 2]
    const objeto = partes.slice(0, -2).join(' | ')
    if (!objeto) return

    const detalhe = el.nextAll('div.open-close').first()
    const textoDetalhe = limparTexto(detalhe.text())
    const aberturaAt = parseDataBr(textoDetalhe.match(/Data abertura:\s*(\d{2}\/\d{2}\/\d{4}(?:\s*às\s*\d{2}:\d{2})?)/i)?.[1]?.replace(/\s*às\s*/i, ' '))
    const atualizacaoAt = parseDataBr(textoDetalhe.match(/Data atualiza[çc][ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])
    const valorEstimado = parseValorBr(textoDetalhe.match(/Valor Estimado:\s*R\$\s*([\d.,]+)/i)?.[1])

    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

    const anexos: { uri: string; titulo: string }[] = []
    detalhe.find('a[href]').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), ctx.url)
      if (!uri || !/\.(pdf|rar|zip|docx?|xlsx?|7z)(\?|$)/i.test(uri)) return
      anexos.push({ uri, titulo: limparTexto($(a).text()) || 'Anexo' })
    })

    vistos.add(id)
    tenders.push(
      montarTender(sescSC, {
        idLocal: id,
        objeto,
        modalidadeTexto,
        numeroControle: numero || undefined,
        valorEstimado,
        aberturaAt,
        publicadoAt: atualizacaoAt,
        anexos,
      })
    )
  })

  return tenders
}

export const sescSC: SescUnidade = {
  uf: 'SC',
  nome: 'Sesc Santa Catarina',
  urls: () => [URL_LICITACOES],
  parse: parseSc,
}
