// ============================================================
// services/sescRegional/mt.ts — Sesc Mato Grosso.
//
// Desde 01/06/2026 as licitações ficam em https://www.sescmt.com.br/index.php/licitacao/
// (plugin WordPress "licitacao-sescmt-wp"). A página em si vem VAZIA: a lista é
// carregada por AJAX em ajax/licitacao_listagem.php, que devolve um fragmento
// HTML (accordion bootstrap, 10 licitações por página, paginação por
// data-page). O parse recebe esse fragmento no parâmetro `html`.
//
// ATENÇÃO (coletor): o endpoint só responde 200 com o cookie PHPSESSID, obtido
// ao abrir antes a página /index.php/licitacao/ (sem cookie devolve 500).
// A antiga sescmatogrosso.com.br/sesc-mato-grosso/licitacoes é legado (< 01/06/2026).
// ============================================================

import * as cheerio from 'cheerio'
import { GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025 } from './certificados'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import { ContextoDeParse, SescUnidade, ehLicitacaoAtual, limparTexto, montarTender, urlAbsoluta } from './tipos'

const PAGINA_LICITACOES = 'https://www.sescmt.com.br/index.php/licitacao/'
const AJAX =
  'https://www.sescmt.com.br/wp-content/plugins/licitacao-sescmt-wp/includes/licitacao/ajax/licitacao_listagem.php'
// Etapa "Em Aberto" (uuid do select #filtro_etapa da página).
const ETAPA_EM_ABERTO = 'e9d5dada-d930-4bbe-97d5-377684d65671'

function urlPagina(pagina: number): string {
  return `${AJAX}?pagina=${pagina}&etapa=${ETAPA_EM_ABERTO}`
}

// Texto que vem depois de um <strong>rótulo:</strong> dentro do cabeçalho do item.
function campoAposRotulo(bloco: ReturnType<cheerio.CheerioAPI>, rotulo: string, $: cheerio.CheerioAPI): string {
  let valor = ''
  bloco.find('strong').each((_, s) => {
    if (valor) return
    if (limparTexto($(s).text()).toLowerCase() === rotulo.toLowerCase()) {
      valor = limparTexto($(s).parent().text().replace($(s).text(), ''))
    }
  })
  return valor
}

function slug(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Map<string, number>()

  $('#licitacoesAccordion > .accordion-item').each((_, el) => {
    const item = $(el)
    const numero = limparTexto(item.find('.badge-number').first().text())
    if (!numero) return
    const situacao = limparTexto(item.find('.badge-number').first().siblings('.badge').first().text())
    const titulo = limparTexto(item.find('.accordion-header .fw-bolder').first().text())
    const cabecalho = item.find('.accordion-header')
    const modalidadeTexto = campoAposRotulo(cabecalho, 'Modalidade:', $)
    const publicadoAt = parseDataBr(campoAposRotulo(cabecalho, 'Publicação:', $))
    const aberturaAt = parseDataBr(campoAposRotulo(cabecalho, 'Abertura:', $))

    // Credenciamento fica aberto por prazo indeterminado: a "Abertura" é só a
    // data de início — vale a situação do portal.
    const credenciamento = /credenciamento/i.test(modalidadeTexto)
    if (!ehLicitacaoAtual({ situacao, aberturaAt: credenciamento ? undefined : aberturaAt }, ctx.agora)) return

    // "Local" no portal é, na prática, a descrição completa do objeto.
    let local = ''
    item.find('.accordion-collapse h6').each((__, h) => {
      if (/^local/i.test(limparTexto($(h).text()))) local = limparTexto($(h).next('p').text())
    })
    const objeto = local && local.toLowerCase() !== titulo.toLowerCase() ? `${titulo} - ${local}` : titulo || local

    // Downloads são POST (form -> post/arquivo.php); não há URL direta. Guardamos
    // título + uuid, ancorados na página pública.
    const anexos: { uri: string; titulo: string }[] = []
    item.find('form[action*="arquivo.php"]').each((__, f) => {
      const form = $(f)
      const uuid = form.find('input[name="uuidDoc"]').attr('value') ?? ''
      const nome = limparTexto(form.find('input[name="nomeReferencia"]').attr('value') ?? form.find('button').text())
      anexos.push({ uri: `${PAGINA_LICITACOES}#${uuid}`, titulo: nome || 'Anexo' })
    })

    // O número se repete entre modalidades (ex.: 26/001 pré-qualificação e concorrência).
    const base = `${numero}-${slug(modalidadeTexto)}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)

    resultado.push(
      montarTender(sescMT, {
        idLocal: n > 1 ? `${base}-${n}` : base,
        objeto,
        modalidadeTexto: modalidadeTexto || titulo,
        numeroControle: numero,
        aberturaAt,
        encerramentoAt: aberturaAt,
        publicadoAt,
        linkEdital: urlAbsoluta(PAGINA_LICITACOES, ctx.url),
        anexos,
      })
    )
  })
  return resultado
}

function proximasPaginas(html: string): string[] {
  const $ = cheerio.load(html)
  const paginas = new Set<number>()
  $('.box-paginacao a.pag-btn[data-page]').each((_, a) => {
    const n = parseInt($(a).attr('data-page') ?? '', 10)
    if (Number.isFinite(n) && n > 1) paginas.add(n - 1)
  })
  return [...paginas].sort((a, b) => a - b).map(urlPagina)
}

export const sescMT: SescUnidade = {
  uf: 'MT',
  nome: 'Sesc Mato Grosso',
  urls: () => [urlPagina(0)],
  // O endpoint de listagem só responde com o cookie PHPSESSID e o Referer desta
  // página (ver nota no topo do arquivo) — o coletor abre esta URL antes.
  sessaoUrl: 'https://www.sescmt.com.br/index.php/licitacao/',
  // O servidor do MT não envia o certificado intermediário (cadeia incompleta).
  certificadosConfiaveis: [GLOBALSIGN_GCC_R6_ALPHASSL_CA_2025],
  parse,
  proximasPaginas,
}
