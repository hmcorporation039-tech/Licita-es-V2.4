import * as cheerio from 'cheerio'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { ModalidadeEnum, NormalizedTender } from '../types'
import { TITULO_COM_MODALIDADE, municipioDaEntidade, tituloDeAviso } from './diarioMunicipalParser'
import {
  GazetaQueridoDiario,
  OrigemDoDiario,
  chaveDeBusca,
  ehFimDeBloco,
  ehInicioDeAviso,
  parseDiarioOficial,
  separarBlocosDeAviso,
} from './queridoDiarioParser'
import { NOMES_DOS_MUNICIPIOS_DO_MARANHAO } from './famemMunicipios'

export const ORIGEM_FAMEM = 'https://diariooficial.famem.org.br'
export const ORIGEM_DO_DIARIO_FAMEM: OrigemDoDiario = { fonte: 'FAMEM', prefixo: 'FAMEM' }
export const UF_DA_FAMEM = 'MA'
export const CAMINHO_DA_PAGINA_DE_PUBLICACOES = '/dom/dom/todasPublicacoes'
export const CAMINHO_DA_LISTA_DE_PUBLICACOES = '/dom/dom/pesquisaPublicacoes/'
export const CAMINHO_DA_PUBLICACAO = '/dom/dom/publicacoesDetalhes'
export const MODALIDADES_FORA_DA_FAMEM: ReadonlySet<ModalidadeEnum> = new Set<ModalidadeEnum>(['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA', 'INEXIGIBILIDADE'])

export interface PublicacaoDaFamem {
  id: string
  publicadaEm: string
  edicao: string | null
  titulo: string
  categoria: string
  entidade: string
}

export interface ListaDaFamem {
  publicacoes: PublicacaoDaFamem[]
  total: number
}

export interface MateriaDaFamem {
  entidade: string
  titulo: string
  texto: string
  publicadaEm: string | null
  edicao: string | null
  codigoIdentificador: string
}

export interface MunicipioDaFamem {
  ibge: string
  nome: string
}

export type AvaliacaoDaPublicacao = 'aviso' | 'contratacaoDireta' | 'outroAto'

export interface ResultadoDaPublicacao {
  tenders: NormalizedTender[]
  avisos: number
  descartadosPorPncp: number
  semDataDaSessao: number
  sessaoJaPassou: number
  contratacoesDiretas: number
}

export class ListaDaFamemIlegivel extends Error {
  constructor(motivo: string) {
    super(`Lista de publicações da FAMEM ilegível: ${motivo}`)
  }
}

const ID_DA_PUBLICACAO = /^\d{1,10}$/
const DATA_DA_LISTA = /^(\d{4}-\d{2}-\d{2})/
const CODIGO_IDENTIFICADOR = /^[0-9a-f]{16,64}$/i
const TAMANHO_MAXIMO_DO_TEXTO = 60_000
const TAMANHO_MAXIMO_DA_ASSINATURA = 300

const TITULO_DE_CONTRATACAO_DIRETA = /\bDISPENSA\b|CONTRATACAO DIRETA|INEXIGIB/
const TITULO_DE_RESUMO_DE_CONTRATO = /\bRESENHA\b|^TERMO DE CREDENCIAMENTO\b/
const TITULO_DE_COMPRA_COM_DISPUTA = /\bPREGAO\b|\bCONCORRENCIA\b|TOMADA DE PRECO|\bLEILAO\b|\bCONVITE\b/
const TITULO_DE_EDITAL_QUE_NAO_E_COMPRA =
  /ALDIR BLANC|\bPNAB\b|ACOES CULTURAIS|FOMENTO A (?:CULTURA|EXECUCAO)|\bPREMI(?:O|OS|ACAO)\b|PARECERISTA|REGULARIZACAO FUNDIARIA|\bREURB\b|MATRICULA|SANCAO E PROMULGACAO/

const MESES_POR_EXTENSO: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
}

const ENDERECO_DE_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const NUMERO_DE_CPF = /(?<!\d)\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2}(?!\d)/g
const TELEFONE_COM_DDD = /\(\s*\d{2}\s*\)\s*\d(?:[\s.-]?\d){7,8}(?!\d)/g
const TELEFONE_ROTULADO =
  /\b(?:telefones?|tel|fones?|fax|celular|whats\s*app)\b\.?\s*(?:n[º°.]?\s*)?:?\s*(?:\+?55\s*)?\(?\d{2}\)?\s*\d(?:[\s.-]?\d){7,8}(?!\d)/gi
const DATA_DA_ASSINATURA =
  /(?:[,–—-]\s*(?:em\s+)?|\baos\s+)(?:\d{1,2}[º°]?\s+(?:dias?\s+(?:do\s+m[eê]s\s+)?)?de\s+(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\.?/gi
const HORARIO_NO_TEXTO = /\d{1,2}\s*(?:h|:)\s*\d{0,2}/i
const DOIS_PONTOS_ANTES_DO_NUMERO = /\s*:\s*(?=[Nn]\s*[º°]|[Nn][º°]?\.\s*\d)/g
const MARCA_DE_LINHA_NEUTRA = '· '

function limpar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function textoDoCampo(valor: unknown): string {
  return typeof valor === 'string' || typeof valor === 'number' ? limpar(String(valor)) : ''
}

export function lerListaDaFamem(corpo: unknown): ListaDaFamem {
  let dados: unknown = corpo
  if (typeof corpo === 'string') {
    try {
      dados = JSON.parse(corpo.trim())
    } catch {
      throw new ListaDaFamemIlegivel('a resposta não é JSON')
    }
  }
  if (!dados || typeof dados !== 'object' || !Array.isArray((dados as { data?: unknown }).data)) {
    throw new ListaDaFamemIlegivel('sem o campo "data"')
  }

  const linhas = (dados as { data: unknown[] }).data
  const publicacoes: PublicacaoDaFamem[] = []
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object') continue
    const item = linha as Record<string, unknown>
    const id = textoDoCampo(item.TDC_ID)
    const data = DATA_DA_LISTA.exec(textoDoCampo(item.TDO_DT_GERACAO))
    if (!ID_DA_PUBLICACAO.test(id) || !data) continue
    publicacoes.push({
      id,
      publicadaEm: data[1],
      edicao: textoDoCampo(item.TDO_EDICAO) || null,
      titulo: textoDoCampo(item.TDC_TITULO),
      categoria: textoDoCampo(item.TDCT_DESCRICAO),
      entidade: textoDoCampo(item.PUBLICACAO_DONO),
    })
  }

  const anunciado = Number((dados as { recordsTotal?: unknown }).recordsTotal)
  return { publicacoes, total: Number.isFinite(anunciado) ? anunciado : publicacoes.length }
}

export function avaliarPublicacao(publicacao: Pick<PublicacaoDaFamem, 'titulo' | 'categoria'>): AvaliacaoDaPublicacao {
  const categoria = chaveDeBusca(limpar(publicacao.categoria))
  const titulo = chaveDeBusca(limpar(publicacao.titulo))
  const juntos = `${categoria} ${titulo}`
  if (!TITULO_COM_MODALIDADE.test(juntos)) return 'outroAto'
  if (!tituloDeAviso(categoria) || !tituloDeAviso(titulo)) return 'outroAto'
  if (TITULO_DE_RESUMO_DE_CONTRATO.test(titulo)) return 'outroAto'
  if (!TITULO_DE_COMPRA_COM_DISPUTA.test(juntos) && TITULO_DE_EDITAL_QUE_NAO_E_COMPRA.test(juntos)) return 'outroAto'
  if (TITULO_DE_CONTRATACAO_DIRETA.test(juntos)) return 'contratacaoDireta'
  return 'aviso'
}

export function municipioDaPublicacao(entidade: string): MunicipioDaFamem | null {
  const achado = municipioDaEntidade(entidade, UF_DA_FAMEM)
  const nome = achado ? NOMES_DOS_MUNICIPIOS_DO_MARANHAO[achado.ibge] : undefined
  return achado && nome ? { ibge: achado.ibge, nome } : null
}

function dataIsoPorExtenso(texto: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(chaveDeBusca(texto).toLowerCase())
  const mes = m ? MESES_POR_EXTENSO[m[2]] : undefined
  return m && mes ? `${m[3]}-${mes}-${m[1].padStart(2, '0')}` : null
}

function textoDoCorpo($: cheerio.CheerioAPI, corpo: cheerio.Cheerio<never>): string {
  corpo.find('script, style').remove()
  corpo.find('br').replaceWith('\n')
  corpo.find('p, div, h1, h2, h3, h4, h5, h6, li, tr, table').each((_, el) => {
    $(el).append('\n')
  })
  corpo.find('td, th').each((_, el) => {
    $(el).append(' ')
  })
  return corpo
    .text()
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[_\-–—= ]{5,}$/gm, '')
    .trim()
    .slice(0, TAMANHO_MAXIMO_DO_TEXTO)
}

function textoAposORotulo($: cheerio.CheerioAPI, alerta: cheerio.Cheerio<never>, icone: string): string {
  return limpar(alerta.find(`.${icone}`).first().parent().text())
}

export function lerPublicacaoDaFamem(html: string): MateriaDaFamem | null {
  const $ = cheerio.load(html)
  const quadro = $('#sidebar .tabela-resultados').first()
  const alerta = quadro.find('.alert').first() as cheerio.Cheerio<never>
  if (quadro.length === 0 || alerta.length === 0) return null

  const entidade = textoAposORotulo($, alerta, 'glyphicon-map-marker')
  const codigoIdentificador = textoAposORotulo($, alerta, 'glyphicon-barcode').replace(/^C[óo]digo Identificador:\s*/i, '')
  if (!entidade || !CODIGO_IDENTIFICADOR.test(codigoIdentificador)) return null

  const edicao = /N[º°.]\s*(\d{1,6})/.exec(textoAposORotulo($, alerta, 'glyphicon-info-sign'))?.[1] ?? null
  const publicadaEm = dataIsoPorExtenso(limpar(alerta.find('time').first().text()))
  const titulo = limpar(quadro.find('h4').first().text())

  const corpo = quadro.clone() as cheerio.Cheerio<never>
  corpo.find('.alert, h4').remove()
  const texto = textoDoCorpo($, corpo)
  if (!texto) return null

  return { entidade, titulo, texto, publicadaEm, edicao, codigoIdentificador: codigoIdentificador.toLowerCase() }
}

function semAssinatura(texto: string): string {
  let ultima: RegExpExecArray | null = null
  DATA_DA_ASSINATURA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATA_DA_ASSINATURA.exec(texto))) ultima = m
  if (!ultima) return texto
  const fim = ultima.index + ultima[0].length
  const resto = texto.slice(fim)
  if (resto.trim().length > TAMANHO_MAXIMO_DA_ASSINATURA || HORARIO_NO_TEXTO.test(resto)) return texto
  return texto.slice(0, fim).trimEnd()
}

function semAssinaturaEmCadaAviso(texto: string): string {
  const segmentos: string[][] = [[]]
  for (const linha of texto.split('\n')) {
    const original = limpar(linha)
    if (segmentos[segmentos.length - 1].length > 0 && ehInicioDeAviso(original, chaveDeBusca(original))) segmentos.push([])
    segmentos[segmentos.length - 1].push(linha)
  }
  return segmentos.map((linhas) => semAssinatura(linhas.join('\n'))).join('\n')
}

export function textoSemDadosPessoais(texto: string): string {
  return semAssinaturaEmCadaAviso(texto)
    .replace(ENDERECO_DE_EMAIL, '')
    .replace(NUMERO_DE_CPF, '')
    .replace(TELEFONE_ROTULADO, '')
    .replace(TELEFONE_COM_DDD, '')
    .replace(/[ \t]{2,}/g, ' ')
}

export function urlDaPublicacao(id: string): string {
  return `${ORIGEM_FAMEM}${CAMINHO_DA_PUBLICACAO}/${id}`
}

function linhaNeutra(linha: string): string {
  const original = linha.replace(/\s+/g, ' ').trim()
  const chave = chaveDeBusca(original)
  return ehInicioDeAviso(original, chave) || ehFimDeBloco(original, chave) ? `${MARCA_DE_LINHA_NEUTRA}${original}` : linha
}

export function textoParaOParser(texto: string, publicacao: Pick<PublicacaoDaFamem, 'titulo' | 'categoria'>, titulo: string): string {
  const ajustado = texto.replace(DOIS_PONTOS_ANTES_DO_NUMERO, ' ')
  if (separarBlocosDeAviso(ajustado).length > 1) return ajustado
  const cabecalho = [titulo, publicacao.titulo, publicacao.categoria]
    .map((t) => t.replace(DOIS_PONTOS_ANTES_DO_NUMERO, ' '))
    .find((t) => TITULO_COM_MODALIDADE.test(chaveDeBusca(t)))
  if (!cabecalho) return ajustado
  const linhas = ajustado.split('\n')
  const primeira = linhas.findIndex((l) => l.trim() !== '')
  const cabecalhoLimpo = limpar(cabecalho)
  if (primeira >= 0 && chaveDeBusca(limpar(linhas[primeira])).startsWith(chaveDeBusca(cabecalhoLimpo))) {
    linhas[primeira] = limpar(linhas[primeira]).slice(cabecalhoLimpo.length).trim()
  }
  return `AVISO DE LICITAÇÃO\n${cabecalhoLimpo}\n${linhas.map(linhaNeutra).join('\n')}`
}

export function avisosDaPublicacao(
  materia: MateriaDaFamem,
  publicacao: PublicacaoDaFamem,
  municipio: MunicipioDaFamem,
  agora: Date = new Date()
): ResultadoDaPublicacao {
  const vazio: ResultadoDaPublicacao = { tenders: [], avisos: 0, descartadosPorPncp: 0, semDataDaSessao: 0, sessaoJaPassou: 0, contratacoesDiretas: 0 }
  const data = materia.publicadaEm ?? publicacao.publicadaEm
  if (!data) return vazio

  const url = urlDaPublicacao(publicacao.id)
  const gazeta: GazetaQueridoDiario = {
    territory_id: municipio.ibge,
    territory_name: municipio.nome,
    state_code: UF_DA_FAMEM,
    date: data,
    url,
    txt_url: null,
    edition: materia.edicao ?? publicacao.edicao,
  }

  const texto = textoSemDadosPessoais(materia.texto)
  const tituloLimpo = textoSemDadosPessoais(materia.titulo)
  const resultado = parseDiarioOficial(gazeta, textoParaOParser(texto, publicacao, tituloLimpo), agora, ORIGEM_DO_DIARIO_FAMEM)
  const inicioDeHoje = inicioDoDiaEmBrasilia(agora).getTime()

  const contagem = { ...vazio, avisos: resultado.avisos, descartadosPorPncp: resultado.descartadosPorPncp }
  for (const tender of resultado.tenders) {
    if (MODALIDADES_FORA_DA_FAMEM.has(tender.modalidade)) {
      contagem.contratacoesDiretas++
      continue
    }
    if (!tender.aberturaAt) {
      contagem.semDataDaSessao++
      continue
    }
    if (tender.aberturaAt.getTime() < inicioDeHoje) {
      contagem.sessaoJaPassou++
      continue
    }
    contagem.tenders.push({
      ...tender,
      rawJson: {
        ...tender.rawJson,
        publicacao: publicacao.id,
        codigoIdentificador: materia.codigoIdentificador,
        entidade: publicacao.entidade || materia.entidade,
        categoria: publicacao.categoria,
      },
    })
  }
  return contagem
}
