// ============================================================
// services/sescRegional/am.ts — Sesc Amazonas
// Fonte: https://www.sesc-am.com.br/licitacao/ (PHP server-side, UTF-8).
// A página padrão lista o ano corrente com o filtro "Aberto(s)"; cada licitação
// é um bloco: <table class="table"> (objeto + linha Nº Processo / Data Publicação
// / Data Abertura / Modalidade / Status / Ano) seguido de <div id="all"> com os
// anexos (PDF/XLSX). O portal mantém "Aberto" em processos cujas sessões já
// passaram, por isso o filtro real é a Data Abertura (ehLicitacaoAtual).
// Outros anos / gerências (Patrimônio) / Fechados dependem de POST — não cobertos.
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

const URL_LISTAGEM = 'https://www.sesc-am.com.br/licitacao/'

function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

function parseAm(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const unidade = { uf: 'AM', nome: 'Sesc Amazonas', cnpj: undefined }
  const vistos = new Set<string>()
  const tenders: NormalizedTender[] = []

  $('table.table').each((_, tabela) => {
    const t = $(tabela)

    // Cabeçalho -> índice das colunas (não depende da ordem).
    const cabecalho = t.find('tr').filter((__, tr) => $(tr).children('td.label').length > 1).first()
    const dados = cabecalho.next('tr')
    if (!cabecalho.length || !dados.length) return
    const colunas: Record<string, string> = {}
    const celulasDados = dados.children('td')
    cabecalho.children('td').each((i, td) => {
      colunas[semAcento(limparTexto($(td).text()))] = limparTexto(celulasDados.eq(i).text())
    })

    const processo = colunas['no processo'] ?? colunas['n processo'] ?? ''
    if (!processo) return
    const objeto = limparTexto(t.find('div.label_normal').first().text())
    if (!objeto) return

    const aberturaAt = parseDataBr(colunas['data abertura'])
    if (!ehLicitacaoAtual({ situacao: colunas['status'], aberturaAt }, ctx.agora)) return

    const anexos: { uri: string; titulo: string }[] = []
    t.nextAll('div').first().find('a[href]').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), ctx.url)
      if (!uri) return
      anexos.push({ uri, titulo: limparTexto($(a).text()) })
    })
    // O edital é o anexo "EDITAL..." quando existir; senão o primeiro (aviso).
    const edital = anexos.find((a) => /edital/i.test(a.titulo)) ?? anexos[0]

    const tender = montarTender(unidade, {
      idLocal: processo,
      objeto,
      modalidadeTexto: colunas['modalidade'] || objeto,
      numeroControle: processo,
      aberturaAt,
      publicadoAt: parseDataBr(colunas['data publicacao']),
      linkEdital: edital?.uri,
      anexos,
    })
    if (vistos.has(tender.fonteId)) return
    vistos.add(tender.fonteId)
    tenders.push(tender)
  })

  return tenders
}

export const sescAM: SescUnidade = {
  uf: 'AM',
  nome: 'Sesc Amazonas',
  urls: () => [URL_LISTAGEM],
  parse: parseAm,
}
