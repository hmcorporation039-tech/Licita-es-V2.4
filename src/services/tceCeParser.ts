import * as cheerio from 'cheerio'
import { ModalidadeEnum, NormalizedTender, SituacaoEnum } from '../types'
import { horaDeBrasilia, inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { parseValorBr } from '../lib/scrapingHelpers'
import { dataPlausivel } from '../lib/dataPlausivel'
import { findMunicipioByNomeUf, normalize } from '../lib/geoService'
import { limparTexto, truncar } from './sescRegional/tipos'
import { NOMES_DOS_MUNICIPIOS_DO_CEARA } from './tceCeMunicipios'

export const TCE_CE_ORIGEM = 'https://municipios-licitacoes.tce.ce.gov.br'
export const PREFIXO_DO_FONTE_ID_TCE_CE = 'TCE-CE-'

const UF_DO_CEARA = 'CE'
const MAX_UNIDADE = 250
const MAX_ARQUIVOS = 40
const CAMINHO_DO_DETALHE = /\/licitacao\/detalhes\/proc\/(\d+)\/licit\/(\d+)/
const CAMINHO_DA_PAGINA = /\/licitacao\/abertas\/page\/(\d+)/
const DATA_BR = /(\d{2})\/(\d{2})\/(\d{4})/
const HORA = /(\d{1,2})[:h](\d{2})/
const ENDERECO_NA_WEB = /(https?:\/\/[^\s,;]+|www\.[^\s,;]+)/i

export interface IdsDaLicitacaoTceCe {
  idProcesso: number
  idLicitacao: number
}

export interface LinhaDaListaTceCe extends IdsDaLicitacaoTceCe {
  numero: string
  municipio: string
  objeto: string
  publicadoEm?: string
  aberturaEm?: string
  reaberturaEm?: string
  valorEstimado?: number
}

export interface PaginaDeAbertasTceCe {
  linhas: LinhaDaListaTceCe[]
  ultimaPagina: number | null
}

export interface PublicacaoDoAviso {
  meio: string
  especificacao: string
  data?: string
}

export interface DetalheDaLicitacaoTceCe {
  municipio: string
  ente: string
  numero: string
  objeto: string
  sinteseDoObjeto?: string
  modalidade: string
  criterioDeJulgamento?: string
  situacao: string
  publicacaoEm?: string
  aberturaEm?: string
  horaDaAbertura?: string
  republicacaoEm?: string
  reaberturaEm?: string
  horaDaReabertura?: string
  local?: string
  publicacoes: PublicacaoDoAviso[]
  orgaos: string[]
  processoAdministrativo?: string
  registroDePreco?: boolean
  regime?: string
  arquivos: string[]
}

export type LeituraDoTceCe = { tipo: 'licitacao'; tender: NormalizedTender } | { tipo: 'ignorado'; motivo: string }

const SITUACOES: { padrao: RegExp; situacao: SituacaoEnum }[] = [
  { padrao: /^(aberta|em andamento|publicada|em aberto)/, situacao: 'ABERTA' },
  { padrao: /^(suspensa|adiada)/, situacao: 'SUSPENSA' },
  { padrao: /^cancelada/, situacao: 'CANCELADA' },
  { padrao: /^revogada/, situacao: 'REVOGADA' },
  { padrao: /^anulada/, situacao: 'ANULADA' },
  { padrao: /^(homologada|adjudicada)/, situacao: 'HOMOLOGADA' },
  { padrao: /^(deserta|fracassada|encerrada|concluida|fechada|finalizada)/, situacao: 'ENCERRADA' },
]

const MODALIDADES: { padrao: RegExp; modalidade: ModalidadeEnum }[] = [
  { padrao: /^concorrencia/, modalidade: 'CONCORRENCIA' },
  { padrao: /^tomada de precos?/, modalidade: 'TOMADA_DE_PRECOS' },
  { padrao: /^convite/, modalidade: 'CONVITE' },
  { padrao: /^concurso/, modalidade: 'CONCURSO' },
  { padrao: /^dialogo competitivo/, modalidade: 'DIALOGO_COMPETITIVO' },
  { padrao: /^credenciamento/, modalidade: 'CREDENCIAMENTO' },
  { padrao: /^inexigibilidade/, modalidade: 'INEXIGIBILIDADE' },
  { padrao: /^dispensa eletronica/, modalidade: 'DISPENSA_COM_DISPUTA' },
  { padrao: /^dispensa/, modalidade: 'DISPENSA_SEM_DISPUTA' },
]

const SINAIS_DE_DISPUTA_ELETRONICA = /(https?:|www\.|\.com|\.br\b|\.org|eletr[oô]nic|plataforma|sistema|portal|internet|on-?line|compras ?gov|comprasnet|bll|licita[cç][oõ]es-e|bnc\b|m2a|licitanet|licitamais|licita mais)/i
const SINAIS_DE_SESSAO_PRESENCIAL = /(presencial|\bsala\b|\bsede\b|audit[oó]rio|\brua\b|\bav\.|avenida|pra[cç]a|pa[cç]o municipal|pr[eé]dio|\bn[ºo°]\s*\d)/i

const PLATAFORMAS: { padrao: RegExp; nome: string }[] = [
  { padrao: /compras[ .]?gov|comprasnet|gov\.br\/compras/i, nome: 'Compras.gov.br' },
  { padrao: /bll/i, nome: 'BLL Compras' },
  { padrao: /licita[cç][oõ]es-e|banco do brasil/i, nome: 'Licitações-e (Banco do Brasil)' },
  { padrao: /\bbnc\b|bolsa nacional de compras/i, nome: 'BNC' },
  { padrao: /m2a/i, nome: 'M2A Tecnologia' },
  { padrao: /licitanet/i, nome: 'Licitanet' },
  { padrao: /licita ?mais/i, nome: 'Licitamais Brasil' },
  { padrao: /portal de compras p[uú]blicas|portaldecompraspublicas/i, nome: 'Portal de Compras Públicas' },
]

export function caminhoDaListaTceCe(pagina: number): string {
  return `/index.php/licitacao/abertas/page/${pagina}/mun/000`
}

export function caminhoDoDetalheTceCe(ids: IdsDaLicitacaoTceCe): string {
  return `/index.php/licitacao/detalhes/proc/${ids.idProcesso}/licit/${ids.idLicitacao}`
}

export function urlDoDetalheTceCe(ids: IdsDaLicitacaoTceCe): string {
  return `${TCE_CE_ORIGEM}${caminhoDoDetalheTceCe(ids)}`
}

export function fonteIdTceCe(idLicitacao: number): string {
  return `${PREFIXO_DO_FONTE_ID_TCE_CE}${idLicitacao}`
}

export function idDaLicitacaoTceCe(fonteId: string): number | undefined {
  const m = fonteId.match(/^TCE-CE-(\d+)$/)
  return m ? Number(m[1]) : undefined
}

function dataDoTexto(texto: string | undefined): string | undefined {
  return texto?.match(DATA_BR)?.[0]
}

export function diaDeBrasilia(data: string | undefined, hora?: string): Date | undefined {
  const m = data?.match(DATA_BR)
  if (!m) return undefined
  const h = hora?.match(HORA)
  const horas = h ? Number(h[1]) : 0
  const minutos = h ? Number(h[2]) : 0
  const valida = horas < 24 && minutos < 60
  const resultado = horaDeBrasilia(Number(m[3]), Number(m[2]) - 1, Number(m[1]), valida ? horas : 0, valida ? minutos : 0)
  return dataPlausivel(resultado)
}

export function sessaoDaLinha(linha: LinhaDaListaTceCe): Date | undefined {
  return diaDeBrasilia(linha.reaberturaEm) ?? diaDeBrasilia(linha.aberturaEm)
}

export function linhaComSessaoFutura(linha: LinhaDaListaTceCe, agora: Date): boolean {
  const sessao = sessaoDaLinha(linha)
  return !!sessao && sessao.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export function assinaturaDaLinha(linha: LinhaDaListaTceCe): string {
  return [
    linha.idProcesso,
    linha.numero,
    normalize(linha.objeto),
    linha.publicadoEm ?? '',
    linha.aberturaEm ?? '',
    linha.reaberturaEm ?? '',
    linha.valorEstimado ?? '',
  ].join('|')
}

function idsDoHref(href: string | undefined): IdsDaLicitacaoTceCe | undefined {
  const m = href?.match(CAMINHO_DO_DETALHE)
  return m ? { idProcesso: Number(m[1]), idLicitacao: Number(m[2]) } : undefined
}

export function parseListaTceCe(html: string): PaginaDeAbertasTceCe {
  const $ = cheerio.load(html)
  const tabela = $('table.tableLicitacoes').first()
  if (tabela.length === 0) throw new Error('TCE-CE: lista de licitações abertas fora do formato esperado')

  const linhas: LinhaDaListaTceCe[] = []
  tabela.find('tbody tr').each((_, tr) => {
    const celulas = $(tr).children('td')
    if (celulas.length < 7) return
    const link = celulas.eq(0).find('a[href]').first()
    const ids = idsDoHref(link.attr('href'))
    const objeto = limparTexto(celulas.eq(2).text())
    const municipio = limparTexto(celulas.eq(1).text())
    if (!ids || !objeto || !municipio) return
    linhas.push({
      ...ids,
      numero: limparTexto(link.text()),
      municipio,
      objeto,
      publicadoEm: dataDoTexto(celulas.eq(3).text()),
      aberturaEm: dataDoTexto(celulas.eq(4).text()),
      reaberturaEm: dataDoTexto(celulas.eq(5).text()),
      valorEstimado: parseValorBr(limparTexto(celulas.eq(6).text())),
    })
  })

  let ultimaPagina: number | null = null
  $('ul.pagination a[href]').each((_, a) => {
    const pagina = Number(($(a).attr('href') ?? '').match(CAMINHO_DA_PAGINA)?.[1])
    if (Number.isSafeInteger(pagina) && pagina > 0) ultimaPagina = Math.max(ultimaPagina ?? 0, pagina)
  })

  return { linhas, ultimaPagina }
}

function rotulo(texto: string): string {
  return normalize(limparTexto(texto)).replace(/:\s*$/, '').trim()
}

function semSetas(texto: string): string {
  return limparTexto(texto.replace(/→/g, ' '))
}

function paresDeRotuloEValor($: cheerio.CheerioAPI, bloco: cheerio.Cheerio<never>, seletorDoRotulo: string): [string, string][] {
  const pares: [string, string][] = []
  let chave: string | null = null
  let partes: string[] = []
  const fechar = () => {
    if (chave) pares.push([chave, semSetas(partes.join(' '))])
  }
  bloco.contents().each((_, no) => {
    const item = $(no)
    if (item.is(seletorDoRotulo)) {
      fechar()
      chave = rotulo(item.text())
      partes = []
    } else if (chave !== null) {
      partes.push(item.text())
    }
  })
  fechar()
  return pares
}

function camposDoDetalhe($: cheerio.CheerioAPI): Map<string, string> {
  const campos = new Map<string, string>()
  $('blockquote p').each((_, p) => {
    for (const [chave, valor] of paresDeRotuloEValor($, $(p) as cheerio.Cheerio<never>, 'strong')) {
      if (chave && !campos.has(chave)) campos.set(chave, valor)
    }
  })
  return campos
}

function campo(campos: Map<string, string>, ...chaves: string[]): string | undefined {
  for (const chave of chaves) {
    const valor = campos.get(chave)
    if (valor) return valor
  }
  return undefined
}

function blocoDoTitulo($: cheerio.CheerioAPI, titulo: RegExp): cheerio.Cheerio<never> {
  const h4 = $('h4').filter((_, el) => titulo.test(normalize(limparTexto($(el).text())))).first()
  return (h4.length > 0 ? h4.parent() : $([])) as cheerio.Cheerio<never>
}

function publicacoesDoAviso($: cheerio.CheerioAPI): PublicacaoDoAviso[] {
  const publicacoes: PublicacaoDoAviso[] = []
  blocoDoTitulo($, /^forma de publicacao/).find('li').each((_, li) => {
    const item = $(li) as cheerio.Cheerio<never>
    const meio = limparTexto(item.find('strong').first().text())
    const pares = new Map(paresDeRotuloEValor($, item, 'mark'))
    const especificacao = pares.get('especificacao') ?? ''
    const data = dataDoTexto(pares.get('data'))
    if (meio || especificacao) publicacoes.push({ meio, especificacao, ...(data ? { data } : {}) })
  })
  return publicacoes
}

function orgaosDoDetalhe($: cheerio.CheerioAPI): string[] {
  return blocoDoTitulo($, /^orgaos/)
    .find('li')
    .map((_, li) => limparTexto($(li).text()))
    .get()
    .filter(Boolean)
}

function arquivosDoDetalhe($: cheerio.CheerioAPI): string[] {
  const arquivos: string[] = []
  $('a[href*="/licitacao/baixarArquivo/"]').each((_, a) => {
    const link = $(a)
    if (/exclu[ií]do/i.test(link.find('.badge').text())) return
    const titulo = limparTexto(link.clone().children('.badge').remove().end().text())
    if (titulo && arquivos.length < MAX_ARQUIVOS) arquivos.push(titulo)
  })
  return arquivos
}

export function parseDetalheTceCe(html: string): DetalheDaLicitacaoTceCe {
  const $ = cheerio.load(html)
  const cabecalho = $('h2').filter((_, el) => $(el).text().includes('|')).first()
  const titulo = limparTexto(cabecalho.text())
  const temDetalhamento = $('h3').filter((_, el) => /detalhamento/i.test($(el).text())).length > 0
  if (!temDetalhamento || !titulo) throw new Error('TCE-CE: detalhe da licitação fora do formato esperado')

  const [municipio, ente] = titulo.split('|').map((parte) => limparTexto(parte))
  const campos = camposDoDetalhe($)
  const numero = limparTexto(cabecalho.nextAll('p').first().text()).replace(/^licita[cç][aã]o:\s*/i, '')
  const registro = campo(campos, 'registro de preco')

  return {
    municipio,
    ente: ente || 'Prefeitura Municipal',
    numero,
    objeto: campo(campos, 'objeto') ?? '',
    sinteseDoObjeto: campo(campos, 'sintese do objeto'),
    modalidade: campo(campos, 'modalidade') ?? '',
    criterioDeJulgamento: campo(campos, 'criterio de julgamento'),
    situacao: campo(campos, 'situacao') ?? '',
    publicacaoEm: dataDoTexto(campo(campos, 'data da publicacao do aviso')),
    aberturaEm: dataDoTexto(campo(campos, 'data de abertura', 'data da abertura')),
    horaDaAbertura: campo(campos, 'hora da abertura', 'hora de abertura')?.match(HORA)?.[0],
    republicacaoEm: dataDoTexto(campo(campos, 'data da republicacao do aviso')),
    reaberturaEm: dataDoTexto(campo(campos, 'data da reabertura', 'data de reabertura')),
    horaDaReabertura: campo(campos, 'hora da reabertura', 'hora de reabertura')?.match(HORA)?.[0],
    local: campo(campos, 'local'),
    publicacoes: publicacoesDoAviso($),
    orgaos: orgaosDoDetalhe($),
    processoAdministrativo: campo(campos, 'nº do processo administrativo', 'n do processo administrativo', 'numero do processo administrativo'),
    registroDePreco: registro ? /^sim/i.test(registro) : undefined,
    regime: campo(campos, 'regime'),
    arquivos: arquivosDoDetalhe($),
  }
}

export function situacaoDoTceCe(texto: string): SituacaoEnum | undefined {
  const chave = normalize(limparTexto(texto))
  return SITUACOES.find((s) => s.padrao.test(chave))?.situacao
}

export function disputaEletronica(local: string | undefined): boolean {
  const texto = local ?? ''
  if (SINAIS_DE_DISPUTA_ELETRONICA.test(texto)) return true
  return !SINAIS_DE_SESSAO_PRESENCIAL.test(texto)
}

export function modalidadeDoTceCe(modalidade: string, local: string | undefined): ModalidadeEnum {
  const chave = normalize(limparTexto(modalidade))
  if (/^pregao/.test(chave)) {
    if (/presencial/.test(chave)) return 'PREGAO_PRESENCIAL'
    if (/eletronico/.test(chave)) return 'PREGAO_ELETRONICO'
    return disputaEletronica(local) ? 'PREGAO_ELETRONICO' : 'PREGAO_PRESENCIAL'
  }
  return MODALIDADES.find((m) => m.padrao.test(chave))?.modalidade ?? 'OUTROS'
}

export function plataformaDoLocal(local: string | undefined): string | undefined {
  const texto = local ?? ''
  const conhecida = PLATAFORMAS.find((p) => p.padrao.test(texto))
  if (conhecida) return conhecida.nome
  const endereco = texto.match(ENDERECO_NA_WEB)?.[1]
  if (!endereco) return undefined
  try {
    return new URL(/^https?:/i.test(endereco) ? endereco : `https://${endereco}`).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

export function publicadoNoPncp(publicacoes: PublicacaoDoAviso[]): boolean {
  return publicacoes.some((p) => /\bpncp\b|portal nacional de contrata/i.test(`${p.meio} ${p.especificacao}`))
}

export function municipioDoCeara(nome: string): { nome: string; codigoIbge: string; lat: number; lng: number } | undefined {
  const geo = findMunicipioByNomeUf(nome, UF_DO_CEARA)
  if (!geo) return undefined
  return { nome: NOMES_DOS_MUNICIPIOS_DO_CEARA[geo.codigoIbge] ?? nome, codigoIbge: geo.codigoIbge, lat: geo.lat, lng: geo.lng }
}

export function tenderProvisorioDaLinha(linha: LinhaDaListaTceCe): NormalizedTender {
  const local = municipioDoCeara(linha.municipio)
  return {
    fonte: 'TCE_CE',
    fonteId: fonteIdTceCe(linha.idLicitacao),
    modalidade: 'OUTROS',
    objeto: linha.objeto,
    valorEstimado: linha.valorEstimado,
    uf: UF_DO_CEARA,
    municipio: local?.nome ?? linha.municipio,
    municipioIbge: local?.codigoIbge,
    aberturaAt: sessaoDaLinha(linha),
    publicadoAt: diaDeBrasilia(linha.publicadoEm),
    numeroControle: linha.numero || undefined,
    rawJson: { numero: linha.numero },
  }
}

export function tenderDoTceCe(linha: LinhaDaListaTceCe, detalhe: DetalheDaLicitacaoTceCe): LeituraDoTceCe {
  const situacao = situacaoDoTceCe(detalhe.situacao)
  if (!situacao) return { tipo: 'ignorado', motivo: `situação desconhecida (${detalhe.situacao || 'vazia'})` }

  const objeto = detalhe.objeto || linha.objeto
  if (!objeto) return { tipo: 'ignorado', motivo: 'sem objeto' }

  const reabertura = diaDeBrasilia(detalhe.reaberturaEm, detalhe.horaDaReabertura)
  const abertura = diaDeBrasilia(detalhe.aberturaEm, detalhe.horaDaAbertura)
  const aberturaAt = reabertura ?? abertura ?? sessaoDaLinha(linha)
  if (!aberturaAt) return { tipo: 'ignorado', motivo: 'sem data de abertura' }

  const local = municipioDoCeara(detalhe.municipio || linha.municipio) ?? municipioDoCeara(linha.municipio)
  const nomeDoMunicipio = local?.nome ?? limparTexto(detalhe.municipio || linha.municipio)
  const plataforma = plataformaDoLocal(detalhe.local)
  const srp = detalhe.registroDePreco ?? (/registro de pre[cç]os?/i.test(objeto) ? true : undefined)

  const tender: NormalizedTender = {
    fonte: 'TCE_CE',
    fonteId: fonteIdTceCe(linha.idLicitacao),
    modalidade: modalidadeDoTceCe(detalhe.modalidade, detalhe.local),
    situacao,
    objeto,
    objetoResumido: truncar(objeto),
    valorEstimado: linha.valorEstimado,
    srp,
    uf: UF_DO_CEARA,
    municipio: nomeDoMunicipio,
    municipioIbge: local?.codigoIbge,
    municipioLat: local?.lat,
    municipioLng: local?.lng,
    orgao: `${detalhe.ente} de ${nomeDoMunicipio}`,
    unidade: detalhe.orgaos.length > 0 ? truncar(detalhe.orgaos.join('; '), MAX_UNIDADE) : undefined,
    aberturaAt,
    publicadoAt: diaDeBrasilia(detalhe.publicacaoEm) ?? diaDeBrasilia(linha.publicadoEm),
    linkEdital: urlDoDetalheTceCe(linha),
    numeroControle: linha.numero || detalhe.numero || undefined,
    rawJson: {
      idProcesso: linha.idProcesso,
      idLicitacao: linha.idLicitacao,
      numero: linha.numero || detalhe.numero,
      ente: detalhe.ente,
      modalidadeNaOrigem: detalhe.modalidade,
      criterioDeJulgamento: detalhe.criterioDeJulgamento ?? null,
      situacaoNaOrigem: detalhe.situacao,
      sinteseDoObjeto: detalhe.sinteseDoObjeto ?? null,
      local: detalhe.local ?? null,
      plataforma: plataforma ?? null,
      disputaEletronica: disputaEletronica(detalhe.local),
      publicacoes: detalhe.publicacoes,
      publicadoNoPncp: publicadoNoPncp(detalhe.publicacoes),
      orgaos: detalhe.orgaos,
      processoAdministrativo: detalhe.processoAdministrativo ?? null,
      regime: detalhe.regime ?? null,
      aberturaOriginal: abertura?.toISOString() ?? null,
      reaberta: !!reabertura,
      republicacaoEm: detalhe.republicacaoEm ?? null,
      arquivos: detalhe.arquivos,
      assinaturaDaLista: assinaturaDaLinha(linha),
    },
  }

  return { tipo: 'licitacao', tender }
}
