// ============================================================
// services/fiegParser.ts — Normaliza a listagem HTML do Sistema FIEG
// Fonte: fieg.com.br/licitacao/site/Cotacao.do?acao=listarCotacao&page=N
// Reconhecimento manual em 2026-09-28: sistema Java antigo (Struts, ".do"),
// HTML server-side, paginação por query string, ~20 itens/página.
// Sistema S — não segue a Lei 14.133 (TCU já decidiu isso pro SESC, mesma
// lógica vale aqui), por isso não está no PNCP.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../types'
import { parseDataBr } from '../lib/scrapingHelpers'

function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

export const FIEG_CNPJ = '01618958000103'

// "Cotação nº 026/0000 - SESI" ou "... - SESI (Finalizada)" -> { numero, entidade }
function parseTitulo(titulo: string): { numero?: string; entidade?: string } {
  const m = titulo.match(/n[ºo°]\s*([^\s-][^-]*?)\s*-\s*(.+)/i)
  if (!m) return {}
  const entidade = m[2].replace(/\([^)]*\)/g, '').trim()
  return { numero: m[1].trim(), entidade: entidade || undefined }
}

// Licitação encerrada/executada não deve entrar no sistema (mesmo princípio
// em sescGoParser.ts, novacapParser.ts, sestSenatParser.ts). Aqui o único
// sinal de status é o parêntese no fim do título — "(Finalizada)" na
// amostra real; a expressão cobre outras variações prováveis do mesmo site.
function statusFechado(titulo: string): boolean {
  const m = titulo.match(/\(([^)]+)\)\s*$/)
  return m ? /finalizad|encerrad|cancelad|desert|fracassad|revogad/i.test(m[1]) : false
}

// Total de páginas a partir do texto "N itens encontrado(s), mostrando X a Y."
// — não conta os links de página visíveis (".pagelinks a") porque em listas
// grandes o site só mostra uma janela de páginas adjacentes, não todas.
export function extrairTotalPaginas(html: string): number {
  const $ = cheerio.load(html)
  const banner = $('.pagebanner').first().text()
  const m = banner.match(/(\d+)\s*itens?\s*encontrado.*?mostrando\s*(\d+)\s*a\s*(\d+)/i)
  if (!m) return 1
  const total = Number(m[1])
  const pageSize = Math.max(1, Number(m[3]) - Number(m[2]) + 1)
  return Math.max(1, Math.ceil(total / pageSize))
}

export function parseFiegListagem(html: string): NormalizedTender[] {
  const $ = cheerio.load(html)
  const tenders: NormalizedTender[] = []

  $('ul.licitacoesLista > li').each((_, li) => {
    const item = $(li)
    const href = item.find('a.visualizarLic').attr('href') ?? ''
    const codigoMatch = href.match(/vo\.codigo=(\d+)/)
    if (!codigoMatch) return

    const dataTexto = item.find('.data').text().replace(/\s+/g, ' ')
    const dataMatch = dataTexto.match(/(\d{2}\/\d{2}\/\d{4})/)
    const horaMatch = dataTexto.match(/(\d{2}:\d{2})/)
    const abertura = dataMatch ? parseDataBr(`${dataMatch[1]} ${horaMatch?.[1] ?? '00:00'}`) : undefined

    const tituloTexto = item.find('.titu').text().replace(/\s+/g, ' ').trim()
    if (statusFechado(tituloTexto)) return

    const { numero, entidade } = parseTitulo(tituloTexto)
    const objeto = item.find('.tituDesc p').text().replace(/\s+/g, ' ').trim()

    tenders.push({
      fonte: 'FIEG',
      fonteId: `FIEG-${codigoMatch[1]}`,
      // O site não expõe modalidade estruturada — tudo aparece só como
      // "Cotação", que não é um conceito de nenhuma das leis de licitação.
      modalidade: 'OUTROS',
      objeto: objeto || tituloTexto,
      objetoResumido: truncate(objeto || tituloTexto),
      uf: 'GO',
      orgao: entidade ? `Sistema FIEG - ${entidade}` : 'Sistema FIEG',
      orgaoCnpj: FIEG_CNPJ,
      // "Abertura em" não é claramente prazo final ou data de publicação —
      // o site só expõe essa data única. Vai em aberturaAt (não em
      // encerramentoAt): a retenção (retentionService.ts) apaga qualquer
      // licitação sem interação cujo encerramentoAt já passou, e "Abertura
      // em" já passada não quer dizer que a cotação encerrou — quem decide
      // isso é o "(Finalizada)" do título (ver statusFechado acima).
      aberturaAt: abertura,
      linkEdital: href.startsWith('http') ? href : `https://www.fieg.com.br/licitacao/site/${href}`,
      numeroControle: numero,
      rawJson: {},
    })
  })

  return tenders
}
