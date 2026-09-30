// ============================================================
// services/sescRegional/pa.ts — Sesc Pará
// Fonte: https://www.sesc-pa.com.br/licitacao (ASP.NET, server-side, UTF-8).
// Tabela .ps-licitacao-table: Abertura | Processo | Modalidade | Objeto |
// Status | link de detalhe. A listagem completa tem ~100 processos (histórico);
// pedimos só status=andamento e status=aberto (pageSize=50). "Em Andamento" no
// portal inclui processos cuja sessão já ocorreu, então o filtro final é a data
// de abertura (ehLicitacaoAtual). Disputa: Compras.gov.br (texto do detalhe).
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

const BASE = 'https://www.sesc-pa.com.br/licitacao'

function parsePa(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const unidade = { uf: 'PA', nome: 'Sesc Pará', cnpj: undefined }
  const vistos = new Set<string>()
  const tenders: NormalizedTender[] = []

  $('table.ps-licitacao-table tbody tr').each((_, tr) => {
    const linha = $(tr)
    const processo = limparTexto(linha.find('td.col-numero').text())
    const objeto = limparTexto(linha.find('td.col-objeto').text())
    if (!processo || !objeto) return

    const situacao = limparTexto(linha.find('td.col-status').text())
    const aberturaAt = parseDataBr(linha.find('td.col-abertura').text())
    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

    const link = urlAbsoluta(linha.find('td.col-acoes a').attr('href'), ctx.url)
    const tender = montarTender(unidade, {
      idLocal: processo,
      objeto,
      modalidadeTexto: limparTexto(linha.find('td.col-modalidade').text()) || objeto,
      numeroControle: processo,
      aberturaAt,
      linkEdital: link,
      anexos: link ? [{ uri: link, titulo: 'Detalhe e arquivos do edital' }] : [],
    })
    if (vistos.has(tender.fonteId)) return
    vistos.add(tender.fonteId)
    tenders.push(tender)
  })

  return tenders
}

// Links numerados da paginação (page=N), sem repetir a página atual.
function proximasPaginasPa(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  const ativo = urlAbsoluta($('.pagination .page-item.active a.page-link').attr('href'), ctx.url)
  const saida = new Set<string>()
  $('.pagination .page-item a.page-link').each((_, a) => {
    const url = urlAbsoluta($(a).attr('href'), ctx.url)
    if (url && url !== ativo && /[?&]page=\d+/.test(url)) saida.add(url)
  })
  return [...saida]
}

export const sescPA: SescUnidade = {
  uf: 'PA',
  nome: 'Sesc Pará',
  urls: () => [
    `${BASE}?status=andamento&view=table&pageSize=50`,
    `${BASE}?status=aberto&view=table&pageSize=50`,
  ],
  parse: parsePa,
  proximasPaginas: proximasPaginasPa,
}
