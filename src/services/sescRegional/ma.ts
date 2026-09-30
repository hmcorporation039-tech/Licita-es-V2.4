// ============================================================
// services/sescRegional/ma.ts — Sesc Maranhão (sescma.com.br/licitacao_new/)
// Página HTML estática única (~2,7 MB, histórico inteiro), em abas Bootstrap:
// #regulamento, #abertas ("Abertas / Em Andamento") e #encerradas. Só lemos
// #abertas; cada painel traz "NNNN/AA-MOD - objeto", modalidade, situação,
// descrição, data da sessão (em texto livre) e a tabela de anexos.
// Valor estimado não é publicado.
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

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
}

// "...prevista para as 14h30min (...) do dia 07 de outubro de 2026..."
export function extrairDataSessao(texto: string): Date | undefined {
  const m = texto.match(/dia\s+(\d{1,2})\s+de\s+([A-Za-zçÇãÃ]+)\s+de\s+(\d{4})/i)
  if (!m) return undefined
  const mes = MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
  if (mes === undefined) return undefined
  const antes = texto.slice(0, m.index)
  const h = antes.match(/(\d{1,2})\s*h(?:\s*(\d{2}))?[^\d]*$/i) ?? antes.match(/(\d{1,2})\s*\([^)]*horas?\)\s*$/i)
  const d = new Date(Number(m[3]), mes, Number(m[1]), h ? Number(h[1]) : 0, h?.[2] ? Number(h[2]) : 0)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const out: NormalizedTender[] = []

  $('#abertas .panel').each((_, el) => {
    const painel = $(el)
    const cab = painel.find('.panel-heading .h4')
    const titulo = limparTexto(cab.eq(0).text())
    const modalidadeTexto = limparTexto(cab.eq(1).text())
    const situacao = limparTexto(cab.eq(2).text())
    const m = titulo.match(/^(\S+)\s+-\s+(.+)$/)
    if (!m) return
    const [, processo, objeto] = m

    const corpo = limparTexto(painel.find('.panel-body .col-md-12').first().text())
    const aberturaAt = extrairDataSessao(corpo.split('Informações Adicionais:')[1] ?? corpo)
    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

    const anexos: { uri: string; titulo: string }[] = []
    let publicadoAt: Date | undefined
    painel.find('table td').each((__, td) => {
      const a = $(td).find('a').first()
      const uri = urlAbsoluta(a.attr('href'), ctx.url)
      if (!uri) return
      anexos.push({ uri, titulo: limparTexto(a.text()) || 'Anexo' })
      const pub = parseDataBr($(td).find('.text-muted').text())
      if (pub && (!publicadoAt || pub < publicadoAt)) publicadoAt = pub
    })
    const edital = anexos.find((x) => /^edital/i.test(x.titulo)) ?? anexos[anexos.length - 1]

    out.push(
      montarTender(sescMA, {
        idLocal: processo,
        objeto,
        modalidadeTexto,
        numeroControle: processo,
        aberturaAt,
        publicadoAt,
        linkEdital: edital?.uri,
        anexos,
      })
    )
  })
  return out
}

export const sescMA: SescUnidade = {
  uf: 'MA',
  nome: 'Sesc Maranhão',
  urls: () => ['https://sescma.com.br/licitacao_new/'],
  parse,
}
