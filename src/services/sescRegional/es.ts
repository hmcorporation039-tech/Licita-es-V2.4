// ============================================================
// services/sescRegional/es.ts — Sesc Espírito Santo
// A planilha traz só a home (https://sesc-es.com.br); a lista real está em
// https://sesc-es.com.br/licitacoes-e-editais/ (menu "Licitações e Editais").
// WordPress + plugin "Simple Job Board" adaptado: HTML renderizado no servidor,
// um bloco `.list-data` por licitação, com título ("PG 074/2026"), modalidade
// (.job-type), datas de atualização/publicação, descrição + links dos anexos
// (.sjb_more_content) e a categoria em "Job Features" (Licitações em Andamento /
// Homologadas / Desertas / Suspensas...). Paginação: ?paged=N, mais nova primeiro.
// O portal NÃO informa data de sessão: "atual" = categoria "em andamento" E
// publicada nos últimos 60 dias (senão processos antigos ficam para sempre abertos).
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

const BASE = 'https://sesc-es.com.br/licitacoes-e-editais/'

function idDoLink(href: string | undefined, titulo: string): string {
  if (href) {
    try {
      const slug = new URL(href).pathname.split('/').filter(Boolean).pop()
      if (slug) return slug
    } catch {
      // usa o título
    }
  }
  return titulo
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('.list-data').each((_, el) => {
    const bloco = $(el)
    const titulo = limparTexto(bloco.find('.job-title').first().text())
    const linkPagina = urlAbsoluta(bloco.find('.job-info h4 a').first().attr('href'), ctx.url)
    if (!titulo) return

    const modalidadeTexto = limparTexto(bloco.find('.job-type').first().text())
    const publicadoAt = parseDataBr(
      bloco
        .find('.job-date')
        .filter((__, d) => /publicado/i.test($(d).text()))
        .first()
        .text()
    )
    // Categoria do "Job Features" = situação do processo.
    const situacao = limparTexto(bloco.find('.job-features td').eq(1).text())

    // Na categoria só "em andamento" interessa (Homologadas/Desertas/Suspensas/
    // outras ficam de fora), e ela precisa ser recente: não há data de sessão.
    if (!/andamento/i.test(situacao) || !ehLicitacaoAtual({ situacao }, ctx.agora)) return
    if (!publicadaRecentemente(publicadoAt, ctx.agora)) return

    const mais = bloco.find('.sjb_more_content').first()
    const anexos: { uri: string; titulo: string }[] = []
    mais.find('a').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), ctx.url)
      if (uri) anexos.push({ uri, titulo: limparTexto($(a).text()) || 'Anexo' })
    })
    const descricao = mais.clone()
    descricao.find('a, .job-features').remove()
    const objeto = limparTexto(descricao.text()) || titulo

    const id = idDoLink(linkPagina, titulo)
    if (vistos.has(id)) return
    vistos.add(id)

    const numero = titulo.match(/(\d+)\s*\/\s*(\d{4})/)
    resultado.push(
      montarTender(sescES, {
        idLocal: id,
        objeto: `${titulo} - ${objeto}`,
        modalidadeTexto: `${modalidadeTexto} ${titulo}`,
        numeroControle: numero ? `${numero[1]}/${numero[2]}` : titulo,
        publicadoAt,
        linkEdital: anexos[0]?.uri ?? linkPagina,
        anexos,
      })
    )
  })

  return resultado
}

// Mais nova primeiro: só vale abrir a próxima página se a última desta ainda é
// recente (a janela de 60 dias vale para o site todo).
function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  const datas = $('.list-data')
    .map((_, b) =>
      parseDataBr(
        $(b)
          .find('.job-date')
          .filter((__, d) => /publicado/i.test($(d).text()))
          .first()
          .text()
      )
    )
    .get()
    .filter(Boolean) as Date[]
  const ultima = datas[datas.length - 1]
  if (!publicadaRecentemente(ultima, ctx.agora)) return []

  const atual = Number(limparTexto($('.pagination .page-numbers.current').first().text())) || 1
  const urls = new Set<string>()
  $('.pagination a.page-numbers').each((_, a) => {
    const url = urlAbsoluta($(a).attr('href'), ctx.url)
    if (url && new URL(url).searchParams.get('paged') === String(atual + 1)) urls.add(url)
  })
  return [...urls]
}

export const sescES: SescUnidade = {
  uf: 'ES',
  nome: 'Sesc Espírito Santo',
  urls: () => [BASE],
  parse,
  proximasPaginas,
}
