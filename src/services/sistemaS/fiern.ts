import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { ContextoDeParse, SITUACAO_FECHADA, limparTexto, truncar, urlAbsoluta } from '../sescRegional/tipos'
import { FonteHtmlDoSistemaS, aberturaAindaPorVir, dataDoPortal, entidadesDoNome, modalidadeDoSistemaS, orgaoDasEntidades } from './comum'

export const URL_DA_LISTAGEM_DO_RN = 'https://app.fiern.org.br/engine.php?class=LicitacaoDownloadView'
export const PAGINA_PUBLICA_DO_RN = 'https://www.fiern.org.br/processos-de-selecao/'

const SIGLA_DA_FEDERACAO_RN = 'FIERN'
const CHAVE_DO_PROCESSO = /^[A-Za-z0-9-]{3,40}$/
const AVISO_NO_OBJETO = /^\s*==\s*([^=]+?)\s*==\s*/

const COLUNAS = {
  entidade: /^entidade$/,
  modalidade: /^modalidade$/,
  processo: /^processo$/,
  chamamento: /^chamamento/,
  objeto: /^objeto$/,
  publicado: /^publicado/,
  abertura: /^data abertura$/,
  situacao: /^situa/,
} as const

type Coluna = keyof typeof COLUNAS

function indicesDasColunas($: cheerio.CheerioAPI): Partial<Record<Coluna, number>> {
  const indices: Partial<Record<Coluna, number>> = {}
  $('table thead th').each((i, th) => {
    const titulo = limparTexto($(th).text()).toLowerCase()
    for (const coluna of Object.keys(COLUNAS) as Coluna[]) {
      if (indices[coluna] === undefined && COLUNAS[coluna].test(titulo)) indices[coluna] = i
    }
  })
  return indices
}

function chaveDaConsulta(href: string | undefined, base: string): { chave?: string; consulta?: string } {
  const consulta = urlAbsoluta(href, base)
  if (!consulta) return {}
  const chave = new URL(consulta).searchParams.get('key') ?? ''
  return CHAVE_DO_PROCESSO.test(chave) ? { chave, consulta } : {}
}

export function parseFiern(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const indices = indicesDasColunas($)
  if (Object.keys(COLUNAS).some((c) => indices[c as Coluna] === undefined)) throw new Error('FIERN: tabela sem as colunas esperadas')
  const resultado: NormalizedTender[] = []

  $('table tbody tr').each((_, tr) => {
    const celulas = $(tr).children('td')
    const celula = (coluna: Coluna) => limparTexto(celulas.eq(indices[coluna]!).text())
    const situacao = celula('situacao')
    if (!situacao || SITUACAO_FECHADA.test(situacao)) return
    const abertura = dataDoPortal(celula('abertura'))
    if (!aberturaAindaPorVir(abertura, ctx.agora)) return

    const entidade = celula('entidade')
    const orgao = orgaoDasEntidades(entidadesDoNome(entidade, SIGLA_DA_FEDERACAO_RN), 'RN', SIGLA_DA_FEDERACAO_RN)
    if (!orgao) return
    const { chave, consulta } = chaveDaConsulta($(tr).find('a[href*="key="]').first().attr('href'), ctx.url)
    if (!chave) return

    const textoDoObjeto = celula('objeto')
    const aviso = textoDoObjeto.match(AVISO_NO_OBJETO)?.[1]
    const objeto = limparTexto(textoDoObjeto.replace(AVISO_NO_OBJETO, ''))
    if (!objeto) return
    const modalidade = celula('modalidade')

    resultado.push({
      fonte: 'SISTEMA_S',
      fonteId: `HTML-RN:${chave}`,
      modalidade: modalidadeDoSistemaS(modalidade),
      objeto,
      objetoResumido: truncar(objeto),
      uf: 'RN',
      orgao,
      unidade: entidade || undefined,
      aberturaAt: abertura,
      publicadoAt: dataDoPortal(celula('publicado')),
      linkEdital: PAGINA_PUBLICA_DO_RN,
      numeroControle: celula('chamamento') || undefined,
      rawJson: {
        plataforma: 'FIERN',
        modalidade,
        processo: celula('processo') || undefined,
        situacao,
        aviso,
        consulta,
        anexos: [],
      },
    })
  })
  return resultado
}

export function contarLinhasDoRn(html: string): number {
  return cheerio.load(html)('table tbody tr').length
}

export const FONTE_DO_RN: FonteHtmlDoSistemaS = {
  origem: 'HTML-RN',
  contar: contarLinhasDoRn,
  unidade: {
    uf: 'RN',
    chave: 'FIERN',
    nome: 'Sistema FIERN',
    urls: () => [URL_DA_LISTAGEM_DO_RN],
    parse: parseFiern,
  },
}
