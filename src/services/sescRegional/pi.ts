// ============================================================
// services/sescRegional/pi.ts — Sesc Piauí
// Fonte: WordPress (SiteOrigin). A URL da planilha (http://www.sescpiaui.com.br/licitacao/)
// é só um ÍNDICE de botões "Licitações 2026 / 2025 / 2024...", sem nenhuma licitação. A lista
// real fica numa página por ano, com slug irregular (2026: /licitao-2026/ — sem o "ça"),
// então ela é DESCOBERTA a partir do índice (`proximasPaginas`), pelo texto do botão
// ("Licitações <ano>"), em vez de ter o slug fixo no código.
// Cada licitação é um painel de acordeão `.sow-accordion-panel`:
//   título  "EDITAL DE CONCORRÊNCIA Nº 26/000021-CC"
//   corpo   "Objeto: ... Modalidade: ... Situação: ... Data de Abertura: <texto livre
//            com 'dia 03 de setembro 2026'>"
// Os anexos ficam atrás de um formulário (wpforms, exige identificação): não há link
// direto de edital, então linkEdital é a âncora do painel na própria página do ano.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

const INDICE = 'https://www.sescpiaui.com.br/licitacao/'

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
}

// "às 09h30min, do dia 03 de setembro 2026" / "dia 30 de março de 2026"
function dataPorExtenso(texto: string): Date | undefined {
  const m = texto.match(/(\d{1,2})\s*[º°]?\s+de\s+([A-Za-zçÇ]+)\s+(?:de\s+)?(\d{4})/i)
  if (!m) return undefined
  const mes = MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
  if (mes === undefined) return undefined
  const hora = texto.slice(0, m.index).match(/(\d{1,2})\s*h\s*(\d{2})?/i)
  const h = hora ? Number(hora[1]) : 0
  const min = hora?.[2] ? Number(hora[2]) : 0
  return new Date(Number(m[3]), mes, Number(m[1]), h, min)
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()
  const base = ctx.url.split('#')[0]

  $('.sow-accordion-panel').each((_, el) => {
    const painel = $(el)
    const titulo = limparTexto(painel.find('.sow-accordion-title').first().text())
    const corpoEl = painel.find('.sow-accordion-panel-border').first().clone()
    corpoEl.find('form, .wpforms-container, script, style').remove()
    const corpo = limparTexto(corpoEl.text())
    if (!titulo || !corpo) return

    const objeto = corpo.match(/Objeto:\s*(.+?)\s*(?:Modalidade:|Situa[çc][ãa]o:|Data de Abertura:|ANEXOS:|$)/i)?.[1]
    if (!objeto) return
    const modalidadeTexto = corpo.match(/Modalidade:\s*(.+?)\s*(?:Situa[çc][ãa]o:|Data de Abertura:|$)/i)?.[1] ?? titulo
    const situacao = corpo.match(/Situa[çc][ãa]o:\s*(.+?)\s*(?:Data de Abertura:|ANEXOS:|$)/i)?.[1]
    const textoData = corpo.match(/Data de Abertura:\s*(.+?)(?:\s*ANEXOS:|$)/i)?.[1] ?? ''
    const aberturaAt = dataPorExtenso(textoData)

    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

    const numero = titulo.match(/(\d{2,4})\s*\/\s*(\d+)(?:\s*-\s*([A-Za-z]+))?/)
    const anchor = painel.attr('data-anchor-id')
    const idLocal = numero ? `${numero[1]}-${numero[2]}${numero[3] ? '-' + numero[3] : ''}` : anchor
    if (!idLocal || vistos.has(idLocal)) return
    vistos.add(idLocal)

    resultado.push(
      montarTender(sescPI, {
        idLocal,
        objeto,
        modalidadeTexto,
        numeroControle: numero ? `${numero[1]}/${numero[2]}${numero[3] ? '-' + numero[3] : ''}` : undefined,
        aberturaAt,
        linkEdital: anchor ? `${base}#${anchor}` : base,
      })
    )
  })

  return resultado
}

// No índice: acha o botão da página do ano corrente (e, em jan-fev, também a do ano
// anterior, onde ainda pode haver sessão a realizar). Nas páginas de ano não segue nada.
function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  if ($('.sow-accordion-panel').length > 0) return []
  const anos = [ctx.agora.getFullYear()]
  if (ctx.agora.getMonth() <= 1) anos.push(ctx.agora.getFullYear() - 1)
  const urls = new Set<string>()
  // Cada ano é um bloco .circle-icon-box com <h4>Licitações 2026</h4> e o link da página.
  $('.circle-icon-box').each((_, box) => {
    const titulo = limparTexto($(box).find('h4').first().text())
    const ano = titulo.match(/^Licita[çc][õo]es\s+(\d{4})$/i)?.[1]
    if (!ano || !anos.includes(Number(ano))) return
    const href = urlAbsoluta($(box).find('a[href]').first().attr('href'), ctx.url)
    // O site publica esses links em http://, mas o mesmo host responde em TLS:
    // promovemos para https para o conteúdo não trafegar em claro.
    if (href) urls.add(href.replace(/^http:\/\//i, 'https://'))
  })
  return [...urls]
}

export const sescPI: SescUnidade = {
  uf: 'PI',
  nome: 'Sesc Piauí',
  urls: () => [INDICE],
  parse,
  proximasPaginas,
}
