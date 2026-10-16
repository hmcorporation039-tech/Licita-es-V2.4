import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { ContextoDeParse, SITUACAO_FECHADA, limparTexto, truncar, urlAbsoluta } from '../sescRegional/tipos'
import { AnexoDoSistemaS } from './senac'
import { FonteHtmlDoSistemaS, aberturaAindaPorVir, dataDoPortal, entidadesDoNome, modalidadeDoSistemaS, orgaoDasEntidades } from './comum'

export const CARTOES_POR_PAGINA_DA_TRANSPARENCIA_SP = 150

const SIGLA_DA_FEDERACAO_SP = 'FIESP'
const ROTULO_DA_ABERTURA = /data de abertura das propostas/i
const ROTULO_DO_RESULTADO = /homologa|resultado final/i
const ID_DO_SAP = /^\d{6,15}$/

interface PortalDeTransparenciaSp {
  chave: 'SENAI-SP' | 'SESI-SP'
  origem: string
}

export const PORTAIS_DE_TRANSPARENCIA_SP: PortalDeTransparenciaSp[] = [
  { chave: 'SENAI-SP', origem: 'https://transparencia.sp.senai.br' },
  { chave: 'SESI-SP', origem: 'https://transparencia.sesisp.org.br' },
]

interface SecaoDoCartao {
  rotulo: string
  valores: string[]
  anexos: AnexoDoSistemaS[]
}

export function urlDaListagemSp(portal: PortalDeTransparenciaSp): string {
  return `${portal.origem}/licitacoes/licitacoes-editais?Tamanho=${CARTOES_POR_PAGINA_DA_TRANSPARENCIA_SP}`
}

function secoesDoCartao($: cheerio.CheerioAPI, cartao: ReturnType<cheerio.CheerioAPI>, base: string): SecaoDoCartao[] {
  const secoes: SecaoDoCartao[] = []
  cartao.find('ul.documentos').first().children('li').each((_, el) => {
    const item = $(el)
    const rotulo = limparTexto(item.children('strong').first().text())
    const anexos: AnexoDoSistemaS[] = []
    item.find('a[href]').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), base)
      const nome = limparTexto($(a).text())
      if (uri) anexos.push({ uri, titulo: nome || 'Documento' })
    })
    const valores = item.find('li.filtravel').map((__, li) => limparTexto($(li).text())).get().filter(Boolean)
    if (rotulo) secoes.push({ rotulo, valores, anexos })
    else if (secoes.length > 0) secoes[secoes.length - 1].anexos.push(...anexos)
  })
  return secoes
}

function idDoSap(anexos: AnexoDoSistemaS[]): string | undefined {
  for (const anexo of anexos) {
    try {
      const id = new URL(anexo.uri).searchParams.get('id') ?? ''
      if (ID_DO_SAP.test(id)) return id
    } catch {
      continue
    }
  }
  return undefined
}

function anexosRotulados(secoes: SecaoDoCartao[]): AnexoDoSistemaS[] {
  return secoes.flatMap((s) => s.anexos.map((a) => ({ uri: a.uri, titulo: `${s.rotulo} - ${a.titulo}` })))
}

export function parseTransparenciaSp(html: string, portal: PortalDeTransparenciaSp, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []

  $('article.edital').each((_, el) => {
    const cartao = $(el)
    const cabecalho = limparTexto(cartao.find('.numero').first().text())
    const [, numero, modalidadeTexto] = cabecalho.match(/N\.\s*(\d+\/\d{4})\s*\|\s*(.+)$/) ?? []
    if (!numero) return

    const status = limparTexto(cartao.find('[id="Status"]').first().text())
    if (status && SITUACAO_FECHADA.test(status)) return

    const secoes = secoesDoCartao($, cartao, ctx.url)
    if (secoes.some((s) => ROTULO_DO_RESULTADO.test(s.rotulo) && s.valores.length > 0)) return
    const abertura = dataDoPortal(secoes.find((s) => ROTULO_DA_ABERTURA.test(s.rotulo))?.valores[0])
    if (!aberturaAindaPorVir(abertura, ctx.agora)) return

    const entidade = limparTexto(cartao.find('.empresas').first().text())
    const orgao = orgaoDasEntidades(entidadesDoNome(entidade), 'SP', SIGLA_DA_FEDERACAO_SP)
    if (!orgao) return

    const anexos = anexosRotulados(secoes)
    const id = idDoSap(anexos)
    if (!id) return

    const resumo = limparTexto(cartao.find('h3').first().text())
    const objeto = limparTexto(cartao.find('[id="Objeto"]').first().text()) || resumo
    if (!objeto) return

    const criterio = limparTexto(cartao.find('ul.documentos p').first().text()).replace(/^crit[ée]rio de julgamento:\s*/i, '')
    const edital = anexos.find((a) => /chamamento|edital/i.test(a.titulo) && /\.pdf/i.test(a.uri)) ?? anexos[0]

    resultado.push({
      fonte: 'SISTEMA_S',
      fonteId: `SPT-SP:${id}`,
      modalidade: modalidadeDoSistemaS(modalidadeTexto ?? ''),
      objeto,
      objetoResumido: truncar(resumo || objeto),
      uf: 'SP',
      orgao,
      unidade: entidade || undefined,
      aberturaAt: abertura,
      linkEdital: edital?.uri ?? ctx.url,
      numeroControle: numero,
      rawJson: {
        plataforma: 'TRANSPARENCIA_SP',
        portal: portal.chave,
        modalidade: limparTexto(modalidadeTexto),
        status,
        entidade,
        resumo: resumo || undefined,
        criterioDeJulgamento: criterio || undefined,
        anexos,
      },
    })
  })
  return resultado
}

export function contarCartoesSp(html: string): number {
  return cheerio.load(html)('article.edital').length
}

export const FONTES_DA_TRANSPARENCIA_SP: FonteHtmlDoSistemaS[] = PORTAIS_DE_TRANSPARENCIA_SP.map((portal) => ({
  origem: `SPT-${portal.chave}`,
  contar: contarCartoesSp,
  unidade: {
    uf: 'SP',
    chave: portal.chave,
    nome: portal.chave,
    urls: () => [urlDaListagemSp(portal)],
    parse: (html, ctx) => parseTransparenciaSp(html, portal, ctx),
  },
}))
