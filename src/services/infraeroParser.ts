import * as cheerio from 'cheerio'
import { ModalidadeEnum, NormalizedTender, SituacaoEnum } from '../types'
import { parseDataBr } from '../lib/scrapingHelpers'
import { findMunicipioByNomeUf, normalize } from '../lib/geoService'
import { municipioCitado } from '../lib/localDeExecucao'
import { limparTexto, truncar } from './sescRegional/tipos'

export const INFRAERO_ORIGEM = 'https://licitacao.infraero.gov.br'
export const INFRAERO_CNPJ = '00352294000110'
export const INFRAERO_RAZAO_SOCIAL = 'Empresa Brasileira de Infraestrutura Aeroportuária - INFRAERO'
export const CAMINHO_DO_DETALHE_INFRAERO = '/portal_licitacao/servlet/DetalheLicitacao'

const TEXTO_NAO_ENCONTRADO = /o objeto procurado n[ãa]o foi encontrado/i
const MAX_OBSERVACAO = 2000

export interface AeroportoInfraero {
  nome: string
  municipio: string
  uf: string
}

export const AEROPORTOS_INFRAERO: Record<string, AeroportoInfraero> = {
  SBRJ: { nome: 'Aeroporto Santos Dumont', municipio: 'Rio de Janeiro', uf: 'RJ' },
  SWNS: { nome: 'Aeroporto de Anápolis', municipio: 'Anápolis', uf: 'GO' },
  SWUZ: { nome: 'Aeroporto de Luziânia', municipio: 'Luziânia', uf: 'GO' },
  SWFN: { nome: 'Aeroporto de Flores', municipio: 'Manaus', uf: 'AM' },
  SBIP: { nome: 'Aeroporto Regional do Vale do Aço', municipio: 'Ipatinga', uf: 'MG' },
  SBMS: { nome: 'Aeroporto de Mossoró', municipio: 'Mossoró', uf: 'RN' },
  SBSO: { nome: 'Aeroporto de Sorriso', municipio: 'Sorriso', uf: 'MT' },
}

const SEDE = 'SEDE'

type Destino = { modalidade: ModalidadeEnum; cessao?: boolean } | 'ignorar'

const PROCESSOS: { padrao: RegExp; destino: Destino }[] = [
  { padrao: /^preg[aã]o eletr[oô]nico/, destino: { modalidade: 'PREGAO_ELETRONICO' } },
  { padrao: /^preg[aã]o presencial/, destino: { modalidade: 'PREGAO_PRESENCIAL' } },
  { padrao: /^licita[cç][aã]o dispensada/, destino: { modalidade: 'DISPENSA_SEM_DISPUTA' } },
  { padrao: /^licita[cç][aã]o$/, destino: { modalidade: 'CONCORRENCIA' } },
  { padrao: /^concorr[eê]ncia/, destino: { modalidade: 'CONCORRENCIA' } },
  { padrao: /^convite/, destino: { modalidade: 'CONVITE' } },
  { padrao: /^tomada de pre[cç]os/, destino: { modalidade: 'TOMADA_DE_PRECOS' } },
  { padrao: /^concurso/, destino: { modalidade: 'CONCURSO' } },
  { padrao: /^credenciamento/, destino: { modalidade: 'CREDENCIAMENTO' } },
  { padrao: /^dispensa eletr[oô]nica/, destino: { modalidade: 'DISPENSA_COM_DISPUTA' } },
  { padrao: /^dispensa de licita[cç][aã]o/, destino: { modalidade: 'DISPENSA_SEM_DISPUTA' } },
  { padrao: /^inexigibilidade/, destino: { modalidade: 'INEXIGIBILIDADE' } },
  { padrao: /^termo de cess[aã]o de uso/, destino: { modalidade: 'OUTROS', cessao: true } },
  { padrao: /^(leil[aã]o|rdc|pr[eé]-qualifica|chamamento p[uú]blico|convoca[cç][aã]o p[uú]blica|consulta de pre[cç]os)/, destino: { modalidade: 'OUTROS' } },
  {
    padrao:
      /^(comunicado|fato relevante|audi[eê]ncia p[uú]blica|consulta p[uú]blica|acordo de coopera|conv[eê]nio|protocolo de inten|termo de coopera|procedimento de apura|rela[cç][aã]o de compras|contrato |ades[aã]o a ata|inten[cç][aã]o de registro|inaplicabilidade)/,
    destino: 'ignorar',
  },
]

const SITUACOES: { padrao: RegExp; situacao: SituacaoEnum }[] = [
  { padrao: /^em andamento/, situacao: 'ABERTA' },
  { padrao: /^adiada/, situacao: 'SUSPENSA' },
  { padrao: /^suspensa/, situacao: 'SUSPENSA' },
  { padrao: /^homologada/, situacao: 'HOMOLOGADA' },
  { padrao: /^(encerrada|deserta|fracassada)/, situacao: 'ENCERRADA' },
  { padrao: /^cancelada/, situacao: 'CANCELADA' },
  { padrao: /^anulada/, situacao: 'ANULADA' },
  { padrao: /^revogada/, situacao: 'REVOGADA' },
]

export interface AnexoDaInfraero {
  uri: string
  titulo: string
  tipoDocumentoNome?: string
  dataDeReferencia?: string
}

export type LeituraDoDetalheInfraero =
  | { tipo: 'nao_encontrado' }
  | { tipo: 'ignorado'; motivo: string }
  | { tipo: 'licitacao'; tender: NormalizedTender }

export function urlDoDetalheInfraero(idLicitacao: number): string {
  return `${INFRAERO_ORIGEM}${CAMINHO_DO_DETALHE_INFRAERO}?idLicitacao=${idLicitacao}`
}

export function idDaLicitacaoInfraero(fonteId: string): number | undefined {
  const m = fonteId.match(/^INFRAERO-(\d+)$/)
  return m ? Number(m[1]) : undefined
}

function rotulo(texto: string): string {
  return normalize(limparTexto(texto)).replace(/\s*\/\s*/g, '/')
}

function camposDoDetalhe($: cheerio.CheerioAPI): Map<string, cheerio.Cheerio<never>> {
  const campos = new Map<string, cheerio.Cheerio<never>>()
  $('tr').each((_, tr) => {
    const celulas = $(tr).children('td')
    if (celulas.length !== 2) return
    const titulo = celulas.eq(0)
    if ((titulo.attr('bgcolor') ?? '').toUpperCase() !== '#F0F0F0') return
    const chave = rotulo(titulo.text())
    if (chave && !campos.has(chave)) campos.set(chave, celulas.eq(1) as cheerio.Cheerio<never>)
  })
  return campos
}

function textoDoCampo(campos: Map<string, cheerio.Cheerio<never>>, ...chaves: string[]): string {
  for (const chave of chaves) {
    const celula = campos.get(chave)
    if (celula) return limparTexto(celula.text())
  }
  return ''
}

export function destinoDoProcesso(processo: string): Destino {
  const chave = normalize(limparTexto(processo))
  const achado = PROCESSOS.find((p) => p.padrao.test(chave))
  return achado ? achado.destino : { modalidade: 'OUTROS' }
}

export function situacaoDaInfraero(texto: string): SituacaoEnum | undefined {
  const chave = normalize(limparTexto(texto))
  return SITUACOES.find((s) => s.padrao.test(chave))?.situacao
}

export function codigoDoLocal(numero: string): string | undefined {
  const partes = numero.split('/').map((p) => p.trim().toUpperCase())
  if (partes.length < 4) return undefined
  const codigo = partes[2]
  return /^[A-Z]{4}$/.test(codigo) ? codigo : undefined
}

function numeroDeControle(numero: string): string | undefined {
  const partes = numero.split('/').map((p) => p.trim())
  return partes.length >= 4 && partes[0] && partes[3] ? partes.join('/') : undefined
}

function caminhoCodificado(href: string): string | undefined {
  try {
    return new URL(href, INFRAERO_ORIGEM).pathname
  } catch {
    return undefined
  }
}

function anexosDoDetalhe($: cheerio.CheerioAPI): AnexoDaInfraero[] {
  const anexos: AnexoDaInfraero[] = []
  const vistos = new Set<string>()
  $('a[href]').each((_, a) => {
    const href = ($(a).attr('href') ?? '').trim()
    if (!href.startsWith('/arquivos_licitacao/')) return
    const caminho = caminhoCodificado(href)
    if (!caminho) return
    const uri = `${INFRAERO_ORIGEM}${caminho}`
    if (vistos.has(uri)) return
    vistos.add(uri)
    const linha = $(a).parents('tr').eq(1)
    const celulas = linha.children('td')
    const tipo = limparTexto(celulas.eq(0).text())
    const data = limparTexto(celulas.eq(2).text()).match(/\d{2}\/\d{2}\/\d{4}/)?.[0]
    const arquivo = limparTexto($(a).text()) || href.split('/').pop() || 'Anexo'
    anexos.push({
      uri,
      titulo: arquivo.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ').trim() || 'Anexo',
      ...(tipo ? { tipoDocumentoNome: tipo } : {}),
      ...(data ? { dataDeReferencia: data } : {}),
    })
  })
  return anexos
}

function primeiraPublicacao(anexos: AnexoDaInfraero[]): Date | undefined {
  const datas = anexos.map((a) => parseDataBr(a.dataDeReferencia)).filter((d): d is Date => !!d)
  return datas.length > 0 ? new Date(Math.min(...datas.map((d) => d.getTime()))) : undefined
}

interface LocalDaLicitacao {
  uf?: string
  municipio?: string
  municipioIbge?: string
  municipioLat?: number
  municipioLng?: number
  unidade?: string
}

const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function nomeProprio(texto: string): string {
  return texto
    .toLowerCase()
    .split(/\s+/)
    .map((palavra, i) => (i > 0 && PREPOSICOES.has(palavra) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)))
    .join(' ')
}

function localPeloMunicipio(municipio: string, uf: string, unidade: string): LocalDaLicitacao {
  const geo = findMunicipioByNomeUf(municipio, uf)
  return { uf, municipio, municipioIbge: geo?.codigoIbge, municipioLat: geo?.lat, municipioLng: geo?.lng, unidade }
}

function localDaLicitacao(codigo: string | undefined, ufDoPortal: string, objeto: string): LocalDaLicitacao {
  const aeroporto = codigo ? AEROPORTOS_INFRAERO[codigo] : undefined
  if (codigo && aeroporto) return localPeloMunicipio(aeroporto.municipio, aeroporto.uf, `${aeroporto.nome} (${codigo})`)
  if (codigo && codigo !== SEDE) {
    const citado = municipioCitado([objeto], null)
    if (citado) return localPeloMunicipio(nomeProprio(citado.nome), citado.uf, codigo)
  }
  return { uf: /^[A-Z]{2}$/.test(ufDoPortal) ? ufDoPortal : undefined, unidade: codigo === SEDE ? 'Sede (Brasília/DF)' : codigo }
}

function objetoClaro(objeto: string, cessao: boolean | undefined, processo: string): string {
  if (!cessao || /cess[aã]o|concess[aã]o/i.test(objeto)) return objeto
  return `${processo}: ${objeto}`
}

export const MAX_TAMANHO_DO_DETALHE_INFRAERO = 1024 * 1024
export const MAX_ETIQUETAS_DO_DETALHE_INFRAERO = 5000

function quantidadeDeEtiquetas(html: string): number {
  let total = 0
  for (let i = html.indexOf('<'); i !== -1 && total <= MAX_ETIQUETAS_DO_DETALHE_INFRAERO; i = html.indexOf('<', i + 1)) total++
  return total
}

export function parseInfraeroDetalhe(html: string, idLicitacao: number): LeituraDoDetalheInfraero {
  if (html.length > MAX_TAMANHO_DO_DETALHE_INFRAERO || quantidadeDeEtiquetas(html) > MAX_ETIQUETAS_DO_DETALHE_INFRAERO) {
    throw new Error(`Infraero: detalhe ${idLicitacao} fora do formato esperado (página grande demais)`)
  }
  const $ = cheerio.load(html)
  const campos = camposDoDetalhe($)

  if (campos.size === 0) {
    if (TEXTO_NAO_ENCONTRADO.test(limparTexto($('body').text()))) return { tipo: 'nao_encontrado' }
    throw new Error(`Infraero: detalhe ${idLicitacao} fora do formato esperado`)
  }

  const processo = textoDoCampo(campos, 'processo')
  const destino = destinoDoProcesso(processo)
  if (destino === 'ignorar') return { tipo: 'ignorado', motivo: `processo sem disputa (${processo})` }

  const objetoOriginal = textoDoCampo(campos, 'objeto')
  if (!objetoOriginal) return { tipo: 'ignorado', motivo: 'sem objeto' }

  const situacaoNaOrigem = textoDoCampo(campos, 'situacao')
  const situacao = situacaoDaInfraero(situacaoNaOrigem)
  if (!situacao) return { tipo: 'ignorado', motivo: `situação desconhecida (${situacaoNaOrigem || 'vazia'})` }

  const textoDaAbertura = textoDoCampo(campos, 'data/hora de abertura')
  const aberturaAt = parseDataBr(textoDaAbertura)
  if (!aberturaAt) return { tipo: 'ignorado', motivo: `sem data de abertura (${processo})` }

  const numero = textoDoCampo(campos, 'numero')
  const codigo = codigoDoLocal(numero)
  const ufDoPortal = textoDoCampo(campos, 'uf').toUpperCase()
  const objeto = objetoClaro(objetoOriginal, destino.cessao, processo)
  const local = localDaLicitacao(codigo, ufDoPortal, objetoOriginal)
  const anexos = anexosDoDetalhe($)
  const localDeAbertura = textoDoCampo(campos, 'local de abertura')
  const numeroNoLicitacoesE = localDeAbertura.match(/licita[çc][ãa]o\s*n[ºo°]?\s*(\d{5,})/i)?.[1] ?? textoDoCampo(campos, 'observacao').match(/\(id\s*n[ºo°]?\s*(\d{5,})\)/i)?.[1]

  const tender: NormalizedTender = {
    fonte: 'INFRAERO',
    fonteId: `INFRAERO-${idLicitacao}`,
    modalidade: destino.modalidade,
    situacao,
    objeto,
    objetoResumido: truncar(objeto),
    uf: local.uf,
    municipio: local.municipio,
    municipioIbge: local.municipioIbge,
    municipioLat: local.municipioLat,
    municipioLng: local.municipioLng,
    orgao: INFRAERO_RAZAO_SOCIAL,
    orgaoCnpj: INFRAERO_CNPJ,
    unidade: local.unidade,
    aberturaAt,
    publicadoAt: primeiraPublicacao(anexos),
    linkEdital: urlDoDetalheInfraero(idLicitacao),
    numeroControle: numeroDeControle(numero),
    rawJson: {
      idLicitacao,
      processo,
      responsavel: textoDoCampo(campos, 'responsavel') || null,
      ufDoPortal: ufDoPortal || null,
      codigoDoLocal: codigo ?? null,
      localDeAbertura: localDeAbertura || null,
      numeroNoLicitacoesE: numeroNoLicitacoesE ?? null,
      situacaoNaOrigem,
      observacao: truncar(textoDoCampo(campos, 'observacao'), MAX_OBSERVACAO) || null,
      contato: textoDoCampo(campos, 'contato') || null,
      anexos,
    },
  }

  return { tipo: 'licitacao', tender }
}
