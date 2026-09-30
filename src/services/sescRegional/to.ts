// ============================================================
// services/sescRegional/to.ts — Sesc Tocantins
// Fonte: https://www.sescto.com.br/licitacao (ASP.NET Razor, HTML no servidor;
// o endereço da planilha era só a home). A página traz 3 tabelas por aba:
// #dt-abertas (situação "Aberto"), #dt-andamento ("Julgamento", sessão já
// realizada) e #dt-finalizadas (histórico, ~300 itens). Colunas: Edital, Título
// (objeto), Modalidade, Tipo (critério), Abertura (= data de publicação do
// edital), Reunião (sessão, "dd/mm/aa hh:mm"), Situação, link
// /datelhes-licitacao?id=N. Só entram as linhas com situação "Aberto".
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
  publicadaRecentemente,
  urlAbsoluta,
} from './tipos'

// "25/09/26 11:07" (ano com 2 dígitos) ou "25/09/2026 11:07".
function parseReuniao(texto: string): Date | undefined {
  const m = limparTexto(texto).match(/(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2}))?/)
  if (!m) return undefined
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(ano, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).children('td')
    if (tds.length < 7) return
    const celula = (i: number) => limparTexto(tds.eq(i).text())

    const situacao = celula(6)
    if (!/abert/i.test(situacao) || !ehLicitacaoAtual({ situacao }, ctx.agora)) return

    const link = urlAbsoluta(tds.eq(7).find('a').attr('href'), ctx.url)
    const objeto = celula(1)
    if (!link || !objeto) return
    const publicadoAt = parseDataBr(celula(4))
    // O portal mantém "Aberto" sem data de encerramento (e a "Reunião" pode já
    // ter passado): a recência da publicação evita trazer processo esquecido.
    if (!publicadaRecentemente(publicadoAt, ctx.agora)) return

    const id = new URL(link).searchParams.get('id') ?? celula(0)
    if (vistos.has(id)) return
    vistos.add(id)

    resultado.push(
      montarTender(sescTO, {
        idLocal: id,
        objeto,
        modalidadeTexto: celula(2),
        numeroControle: celula(0) || undefined,
        publicadoAt,
        aberturaAt: parseReuniao(celula(5)),
        linkEdital: link,
      })
    )
  })

  return resultado
}

export const sescTO: SescUnidade = {
  uf: 'TO',
  nome: 'Sesc Tocantins',
  urls: () => ['https://www.sescto.com.br/licitacao'],
  parse,
}
