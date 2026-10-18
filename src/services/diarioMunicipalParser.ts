import * as cheerio from 'cheerio'
import municipiosData from '../lib/municipiosBrasil.json'
import { normalize } from '../lib/geoService'
import { NormalizedTender } from '../types'
import {
  GazetaQueridoDiario,
  OrigemDoDiario,
  chaveDeBusca,
  parseDiarioOficial,
  separarBlocosDeAviso,
} from './queridoDiarioParser'

export const ORIGEM_SIGPUB = 'https://www.diariomunicipal.com.br'
export const ORIGEM_DIARIO_MUNICIPAL: OrigemDoDiario = { fonte: 'DIARIO_MUNICIPAL', prefixo: 'DM' }

export interface AssociacaoSigpub {
  slug: string
  uf: string
  nome: string
  entidades: number
}

export const ASSOCIACOES_SIGPUB: AssociacaoSigpub[] = [
  { slug: 'famup', uf: 'PB', nome: 'Federação das Associações de Municípios da Paraíba', entidades: 124 },
  { slug: 'famep', uf: 'PA', nome: 'Federação das Associações de Municípios do Estado do Pará', entidades: 207 },
  { slug: 'amm-mt', uf: 'MT', nome: 'Associação Mato-grossense dos Municípios', entidades: 168 },
  { slug: 'femurn', uf: 'RN', nome: 'Federação dos Municípios do Rio Grande do Norte', entidades: 244 },
  { slug: 'appm', uf: 'PI', nome: 'Associação Piauiense de Municípios', entidades: 35 },
  { slug: 'aam', uf: 'AM', nome: 'Associação Amazonense de Municípios', entidades: 154 },
  { slug: 'arom', uf: 'RO', nome: 'Associação Rondoniense de Municípios', entidades: 56 },
  { slug: 'ama', uf: 'AL', nome: 'Associação dos Municípios Alagoanos', entidades: 109 },
  { slug: 'aprece', uf: 'CE', nome: 'Associação dos Municípios do Estado do Ceará', entidades: 110 },
  { slug: 'amupe', uf: 'PE', nome: 'Associação Municipalista de Pernambuco', entidades: 194 },
  { slug: 'famurs', uf: 'RS', nome: 'Federação das Associações de Municípios do Rio Grande do Sul', entidades: 304 },
  { slug: 'amp', uf: 'PR', nome: 'Associação dos Municípios do Paraná', entidades: 189 },
  { slug: 'amm-mg', uf: 'MG', nome: 'Associação Mineira de Municípios', entidades: 751 },
]

export interface CartaoDeMateria {
  codigo: string
  titulo: string
  entidade: string
  orgao: string
  trecho: string
  circulacao: string | null
  edicao: string | null
}

export interface PaginaDeBusca {
  cartoes: CartaoDeMateria[]
  total: number
  temProxima: boolean
}

export interface MateriaSigpub {
  codigo: string
  entidade: string
  orgao: string
  texto: string
  publicadaEm: string | null
  diario: string | null
  edicao: string | null
}

export interface MunicipioDaEntidade {
  ibge: string
  nome: string
}

export interface ResultadoDaMateria {
  tenders: NormalizedTender[]
  avisos: number
  descartadosPorPncp: number
  semMunicipio: boolean
}

type MunicipioRow = [string, string, string, number, number]

const CODIGO_DA_MATERIA = /^[0-9A-Z]{6,12}$/
const ASSINATURA_DA_PLATAFORMA = /\n\s*Publicado por:[\s\S]*$/
const TAMANHO_MAXIMO_DO_TEXTO = 60_000
const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"])

const TITULO_QUE_DESCARTA =
  /HOMOLOGA|ADJUDICA|RATIFICA|RESULTADO|EXTRATO D[OE] (?:CONTRATO|TERMO|ADITIVO|ATA)|CONTRATO N|ADITIVO|APOSTILAMENTO|ATA DE REGISTRO|ATA D[AE] SESSAO|ERRATA|RETIFICA|SUSPENS|REVOGA|ANULA(?:CAO|DA|DO)|ADIAMENTO|ADIAD|FRACASSAD|DESERT|CANCELA|PRORROGA|IMPUGNA|DECISAO|RECURSO|JULGAMENTO|PROCESSO SELETIVO|CONCURSO PUBLICO|INEXIGIBILIDADE|ORDEM DE SERVICO|INTENCAO DE REGISTRO|ADESAO|CONVOCA(?:CAO|TORIA)|NOTIFICA/
const TITULO_DE_ATO_NORMATIVO = /^(?:PORTARIA|DECRETO|LEI\b|RESOLUCAO|INSTRUCAO NORMATIVA|PARECER|DESPACHO|ATO\s+N)/
export const TITULO_COM_MODALIDADE =
  /LICITAC|\bPREGAO\b|\bCONCORRENCIA\b|\bDISPENSA\b|TOMADA DE PRECO|\bCHAMAMENTO\b|CHAMADA PUBLICA|\bCREDENCIAMENTO\b|\bCOTACAO\b|\bCONVITE\b|\bLEILAO\b|\bEDITAL\b|CONTRATACAO DIRETA/

const PREFIXO_DE_ENTIDADE_MUNICIPAL =
  /^(?:prefeitura(?:\s+municipal)?|munic[ií]pio|c[âa]mara(?:\s+municipal)?(?:\s+de\s+vereadores)?)\s+(?:(?:de|do|da|dos|das)\s+)?/i
const CONECTIVO_ANTES_DO_MUNICIPIO = /\s(?:de|do|da|dos|das)\s/gi

const indicePorUf = new Map<string, MunicipioRow>()
for (const row of municipiosData as MunicipioRow[]) indicePorUf.set(`${row[1]}|${chaveCompacta(row[2])}`, row)

function chaveCompacta(nome: string): string {
  return normalize(nome).replace(/[’`´]/g, "'").replace(/[^a-z0-9]/g, '')
}

function limpar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function dataIsoDeBr(texto: string | undefined): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function codigoDoCaminho(href: string | undefined): string | null {
  const m = /\/materia\/([0-9A-Za-z]+)\/?$/.exec(href ?? '')
  const codigo = m?.[1].toUpperCase()
  return codigo && CODIGO_DA_MATERIA.test(codigo) ? codigo : null
}

function dadosDaLista($: cheerio.CheerioAPI, lista: cheerio.Cheerio<never>): Map<string, string> {
  const dados = new Map<string, string>()
  lista.find('dt').each((_, dt) => {
    const rotulo = normalize(limpar($(dt).text()))
    const valor = limpar($(dt).nextAll('dd').first().text())
    if (rotulo && !dados.has(rotulo)) dados.set(rotulo, valor)
  })
  return dados
}

export function lerPaginaDeBusca(html: string): PaginaDeBusca {
  const $ = cheerio.load(html)
  const cartoes: CartaoDeMateria[] = []
  $('li.materia-card').each((_, li) => {
    const cartao = $(li)
    const link = cartao.find('.materia-card__titulo a').first()
    const dados = dadosDaLista($, cartao.find('dl.materia-card__dados') as cheerio.Cheerio<never>)
    const codigo = codigoDoCaminho(link.attr('href')) ?? (dados.get('codigo identificador') ?? '').toUpperCase()
    if (!CODIGO_DA_MATERIA.test(codigo)) return
    cartoes.push({
      codigo,
      titulo: limpar(link.text()),
      entidade: limpar(cartao.find('.materia-card__entidade').text()),
      orgao: limpar(cartao.find('.materia-card__orgao').text()),
      trecho: limpar(cartao.find('.materia-card__trecho').text()),
      circulacao: dataIsoDeBr(dados.get('circulacao')),
      edicao: dados.get('edicao') || null,
    })
  })

  const numeros = $('.busca-avancada__resumo strong')
    .map((_, el) => Number(limpar($(el).text()).replace(/\D/g, '')))
    .get()
  const total = numeros.length >= 3 && Number.isFinite(numeros[2]) ? numeros[2] : cartoes.length
  const temProxima = $('.paginacao a[rel="next"]').length > 0

  return { cartoes, total, temProxima }
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
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(ASSINATURA_DA_PLATAFORMA, '')
    .trim()
    .slice(0, TAMANHO_MAXIMO_DO_TEXTO)
}

export function lerMateria(html: string, codigoEsperado: string): MateriaSigpub | null {
  const $ = cheerio.load(html)
  const corpo = $('#materia').first()
  if (corpo.length === 0) return null

  const dados = dadosDaLista($, $('.verificacao__dados') as cheerio.Cheerio<never>)
  const codigo = (dados.get('codigo identificador') ?? codigoEsperado).toUpperCase()
  if (codigo !== codigoEsperado.toUpperCase()) return null

  const texto = textoDoCorpo($, corpo as cheerio.Cheerio<never>)
  if (!texto) return null

  return {
    codigo,
    entidade: limpar($('.documento__entidade').first().text()),
    orgao: limpar($('.documento__orgao').first().text()),
    texto,
    publicadaEm: dataIsoDeBr(dados.get('publicada em')),
    diario: dados.get('diario') || null,
    edicao: dados.get('edicao') || null,
  }
}

export function tituloDeAviso(titulo: string): boolean {
  const chave = chaveDeBusca(limpar(titulo))
  return !TITULO_QUE_DESCARTA.test(chave) && !TITULO_DE_ATO_NORMATIVO.test(chave)
}

export function nomeLegivel(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome
  return nome
    .toLowerCase()
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && PALAVRAS_MINUSCULAS.has(palavra)) return palavra
      if (i > 0 && palavra.startsWith("d'")) return `d'${palavra.charAt(2).toUpperCase()}${palavra.slice(3)}`
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}

function procurarMunicipio(nome: string, uf: string): MunicipioDaEntidade | null {
  const row = indicePorUf.get(`${uf}|${chaveCompacta(nome)}`)
  return row ? { ibge: row[0], nome: nomeLegivel(limpar(nome)) } : null
}

export function municipioDaEntidade(entidade: string, uf: string): MunicipioDaEntidade | null {
  const nome = limpar(entidade).replace(new RegExp(String.raw`\s*[-–—/ ]\s*${uf}$`, 'i'), '')
  if (!nome) return null

  const semPrefixo = nome.replace(PREFIXO_DE_ENTIDADE_MUNICIPAL, '')
  if (semPrefixo !== nome) {
    const direto = procurarMunicipio(semPrefixo, uf)
    if (direto) return direto
  }

  CONECTIVO_ANTES_DO_MUNICIPIO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CONECTIVO_ANTES_DO_MUNICIPIO.exec(nome))) {
    const achado = procurarMunicipio(nome.slice(m.index + m[0].length), uf)
    if (achado) return achado
  }
  return null
}

export function urlDaMateria(associacao: AssociacaoSigpub, codigo: string): string {
  return `${ORIGEM_SIGPUB}/${associacao.slug}/materia/${codigo}`
}

export function chaveDaMateria(associacao: AssociacaoSigpub, codigo: string): string {
  return `${associacao.slug}:${codigo}`
}

function textoParaOParser(materia: MateriaSigpub, cartao: CartaoDeMateria): string {
  if (separarBlocosDeAviso(materia.texto).length > 0) return materia.texto
  if (!TITULO_COM_MODALIDADE.test(chaveDeBusca(cartao.titulo))) return materia.texto
  return `AVISO DE LICITAÇÃO\n${cartao.titulo}\n${materia.texto}`
}

export function avisosDaMateria(
  materia: MateriaSigpub,
  cartao: CartaoDeMateria,
  associacao: AssociacaoSigpub,
  agora: Date = new Date()
): ResultadoDaMateria {
  const municipio =
    municipioDaEntidade(cartao.entidade, associacao.uf) ?? municipioDaEntidade(materia.entidade, associacao.uf)
  if (!municipio) return { tenders: [], avisos: 0, descartadosPorPncp: 0, semMunicipio: true }

  const data = materia.publicadaEm ?? cartao.circulacao
  if (!data) return { tenders: [], avisos: 0, descartadosPorPncp: 0, semMunicipio: false }

  const url = urlDaMateria(associacao, materia.codigo)
  const gazeta: GazetaQueridoDiario = {
    territory_id: municipio.ibge,
    territory_name: municipio.nome,
    state_code: associacao.uf,
    date: data,
    url,
    txt_url: null,
    edition: materia.edicao ?? cartao.edicao,
  }

  const resultado = parseDiarioOficial(gazeta, textoParaOParser(materia, cartao), agora, ORIGEM_DIARIO_MUNICIPAL)
  const tenders = resultado.tenders.map((tender) => ({
    ...tender,
    rawJson: {
      ...tender.rawJson,
      codigo: materia.codigo,
      associacao: associacao.slug,
      entidade: cartao.entidade || materia.entidade,
      orgaoDaMateria: cartao.orgao || materia.orgao,
      titulo: cartao.titulo,
    },
  }))

  return { tenders, avisos: resultado.avisos, descartadosPorPncp: resultado.descartadosPorPncp, semMunicipio: false }
}
