// ============================================================
// services/sescRegional/ce.ts — Sesc Ceará
// Fonte: https://sistemas.sesc-ce.com.br/LICITASESC/download/licitacaoList.seam
// (JBoss Seam/JSF, HTML renderizado no servidor). A tabela
// `cadastroForm:licitacaoList` traz Abertura, Processo, Instr.Convoc.,
// Modalidade, Objeto e Status; o portal é compartilhado com o Senac, por isso
// Processo/Instr. vêm como "Sesc 123" e/ou "Senac 456".
// LIMITAÇÃO: a lista é paginada (10 por página) via postback JSF; só o GET da
// primeira página é suportado. Ordenada por abertura decrescente, então as
// sessões futuras vêm primeiro, mas credenciamentos vigentes antigos podem
// ficar na página 2 (não coletada).
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

const URL_LISTA = 'https://sistemas.sesc-ce.com.br/LICITASESC/download/licitacaoList.seam'

// "Sesc 120987 Senac 265834" -> { Sesc: '120987', Senac: '265834' }
function porColigada(celula: ReturnType<cheerio.CheerioAPI>, $: cheerio.CheerioAPI): Record<string, string> {
  const r: Record<string, string> = {}
  celula.find('span[style*="float"]').each((_, s) => {
    const texto = limparTexto($(s).text())
    const m = texto.match(/^(Sesc|Senac)\s*(.+)$/i)
    if (m) r[m[1].toLowerCase()] = m[2].trim()
  })
  return r
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('table[id$="licitacaoList"] tbody tr').each((_, tr) => {
    const tds = $(tr).children('td')
    if (tds.length < 6) return

    const aberturaTxt = limparTexto(tds.eq(0).text())
    const processo = porColigada(tds.eq(1), $)
    const instr = porColigada(tds.eq(2), $)
    const modalidadeTexto = limparTexto(tds.eq(3).text())
    const objeto = limparTexto(tds.eq(4).text())
    const situacao = limparTexto(tds.eq(5).text())

    // Licitação exclusiva do Senac não interessa ao Sesc.
    if (!processo.sesc) return

    const href = tds.eq(0).find('a').attr('href')
    const abs = urlAbsoluta(href, ctx.url)
    if (!abs || !objeto) return
    const u = new URL(abs)
    const licitacaoId = u.searchParams.get('licitacaoId')
    if (!licitacaoId || vistos.has(licitacaoId)) return
    // Link estável: sem ;jsessionid e sem dataModelSelection.
    const link = `${u.origin}${u.pathname.replace(/;jsessionid=[^/?]*/i, '')}?licitacaoId=${licitacaoId}`

    const abertura = parseDataBr(aberturaTxt)
    const ehCredenciamento = /credenciamento/i.test(objeto)
    // Credenciamento vigente fica aberto depois da data de abertura; nele a
    // data só indica o início, então vale apenas a situação.
    if (!ehLicitacaoAtual({ situacao, aberturaAt: ehCredenciamento ? undefined : abertura }, ctx.agora)) return
    vistos.add(licitacaoId)

    let modalidade = detectarModalidade(modalidadeTexto)
    if (ehCredenciamento && (modalidade === 'INEXIGIBILIDADE' || modalidade === 'OUTROS')) {
      modalidade = 'CREDENCIAMENTO'
    }

    const partes = [`Proc. ${processo.sesc}`]
    if (instr.sesc) partes.push(`Instr. ${instr.sesc}`)

    resultado.push(
      montarTender(sescCE, {
        idLocal: licitacaoId,
        objeto,
        modalidade,
        numeroControle: partes.join(' - '),
        aberturaAt: abertura,
        linkEdital: link,
      })
    )
  })

  return resultado
}

export const sescCE: SescUnidade = {
  uf: 'CE',
  nome: 'Sesc Ceará',
  urls: () => [URL_LISTA],
  parse,
}
