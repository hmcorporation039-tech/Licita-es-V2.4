// ============================================================
// services/sescRegional/ac.ts — Sesc Acre
// Fonte: http://cpl.sescacre.com.br/transparencia/ (PHP, HTML no servidor). A
// planilha já aponta para a própria lista: index.php, mais recentes primeiro
// (ordem decrescente de id_edital), paginada por ?pagina=N (5 itens/página).
// Cada edital é um `a[href^="detalhar.php?id_edital="]` com rótulos em <strong>:
// Título, Número, Modalidade, Tipo, Descrição (truncada), Data de Abertura,
// Data de Homologação e Situação. Não há anexos nem valor na listagem (só na
// página de detalhe). Linhas vazias (título vazio, abertura 31/12/1969) são
// ignoradas.
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

const BASE = 'http://cpl.sescacre.com.br/transparencia/'
// A lista é ordenada do mais novo para o mais antigo: duas páginas extras
// cobrem com folga os processos ainda abertos.
const PAGINAS_EXTRAS = [2, 3]

// Valor do rótulo: texto entre "<strong>Rótulo:</strong>" e o próximo <br>/<strong>/<img>.
function campo($: cheerio.CheerioAPI, raiz: ReturnType<cheerio.CheerioAPI>, rotulo: string): string {
  let valor = ''
  raiz.find('strong').each((_, s) => {
    const r = limparTexto($(s).text()).replace(/:$/, '')
    if (valor || r.toLowerCase() !== rotulo.toLowerCase()) return
    let texto = ''
    let no = s.nextSibling
    while (no && !(no.type === 'tag' && ['br', 'strong', 'img'].includes(no.name))) {
      texto += $(no).text()
      no = no.nextSibling
    }
    valor = limparTexto(texto)
  })
  return valor
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('a[href*="detalhar.php?id_edital="]').each((_, el) => {
    const a = $(el)
    const href = a.attr('href') ?? ''
    const id = href.match(/id_edital=(\d+)/)?.[1]
    const link = urlAbsoluta(href, ctx.url)
    const objeto = campo($, a, 'Título') || limparTexto(a.attr('title'))
    if (!id || !link || !objeto || vistos.has(id)) return

    const situacao = campo($, a, 'Situação')
    const aberturaAt = parseDataBr(campo($, a, 'Data de Abertura'))
    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return
    vistos.add(id)

    const modalidade = campo($, a, 'Modalidade')
    const numero = campo($, a, 'Número')
    resultado.push(
      montarTender(sescAC, {
        idLocal: id,
        objeto,
        modalidadeTexto: `${modalidade} ${numero}`,
        numeroControle: numero || undefined,
        aberturaAt,
        linkEdital: link,
      })
    )
  })

  return resultado
}

function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  // Só a primeira página (sem ?pagina=) dispara as extras; evita cascata.
  if (/[?&]pagina=/.test(ctx.url)) return []
  const $ = cheerio.load(html)
  if (!$('a[href*="detalhar.php?id_edital="]').length) return []
  return PAGINAS_EXTRAS.map((n) => new URL(`index.php?pagina=${n}`, ctx.url).toString())
}

export const sescAC: SescUnidade = {
  uf: 'AC',
  nome: 'Sesc Acre',
  urls: () => [BASE],
  parse,
  proximasPaginas,
}
