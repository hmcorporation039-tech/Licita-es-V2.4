// ============================================================
// services/sescRegional/ms.ts — Sesc Mato Grosso do Sul.
//
// Endereço vigente: https://sesc.ms/licitacoes -> escolha "não sou licitante"
// -> https://sesc.ms/licitacao-lista (view Drupal, HTML estático, 10 por página,
// ordenada por publicação desc, paginação ?page=N, 0-based). "Sou licitante"
// leva a login + reCAPTCHA (não usado). https://sesc.ms/licitacao é só o
// histórico (processos anteriores a 05/04/2021) e não é coletado.
// Cada licitação: <h3><b>MODALIDADE AA/XX-NNN - </b>objeto</h3> + bloco com
// Etapa (Editais Abertos / Suspensas / Concluídas / Canceladas), Modalidade,
// datas de publicação/abertura e tabela de arquivos.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import { ContextoDeParse, SescUnidade, ehLicitacaoAtual, limparTexto, montarTender, urlAbsoluta } from './tipos'

const URL_LISTA = 'https://sesc.ms/licitacao-lista'

function valorCampo(bloco: ReturnType<cheerio.CheerioAPI>, classe: string): string {
  return limparTexto(bloco.find(`.views-field-${classe} .field-content`).first().text())
}

// A data ISO do atributo content é mais confiável que o texto exibido.
function dataCampo(bloco: ReturnType<cheerio.CheerioAPI>, classe: string): Date | undefined {
  const span = bloco.find(`.views-field-${classe} [property="dc:date"]`).first()
  return parseDataBr(span.text())
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []

  $('h3.views-accordion-licita_o_lista-page-header').each((_, h3) => {
    const cabecalho = $(h3)
    const bloco = cabecalho.next('div')
    const rotulo = limparTexto(cabecalho.find('b').first().text()).replace(/\s*-\s*$/, '')
    const numero = /(\d{2}\/[A-Za-z]+-\d+)/.exec(rotulo)?.[1]
    if (!numero) return

    const situacao = valorCampo(bloco, 'field-etapas')
    const aberturaAt = dataCampo(bloco, 'field-data-de-abertura')
    const publicadoAt = dataCampo(bloco, 'field-data-de-publica-o')
    if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

    const objeto = valorCampo(bloco, 'field-objeto') || limparTexto(cabecalho.text().replace(rotulo, '').replace(/^\s*-\s*/, ''))
    const modalidadeTexto = valorCampo(bloco, 'field-modalidades') || rotulo

    const anexos: { uri: string; titulo: string }[] = []
    bloco.find('td.extended-file-field-table-filename a').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), ctx.url)
      if (uri) anexos.push({ uri, titulo: limparTexto($(a).text()) || 'Anexo' })
    })

    resultado.push(
      montarTender(sescMS, {
        idLocal: numero,
        objeto,
        modalidadeTexto,
        numeroControle: numero,
        aberturaAt,
        encerramentoAt: aberturaAt,
        publicadoAt,
        anexos,
      })
    )
  })
  return resultado
}

function proximasPaginas(html: string, ctx: ContextoDeParse): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()
  $('ul.pager li.pager-item a').each((_, a) => {
    const u = urlAbsoluta($(a).attr('href'), ctx.url)
    if (u) urls.add(u)
  })
  return [...urls]
}

export const sescMS: SescUnidade = {
  uf: 'MS',
  nome: 'Sesc Mato Grosso do Sul',
  urls: () => [URL_LISTA],
  parse,
  proximasPaginas,
}
