import { ModalidadeEnum, NormalizedTender, SituacaoEnum } from '../types'
import { horaDeBrasilia, inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { dataPlausivel } from '../lib/dataPlausivel'
import { findMunicipioByNomeUf, normalize } from '../lib/geoService'
import { limparTexto, truncar } from './sescRegional/tipos'

export const TCE_RS_DADOS_ABERTOS = 'https://dados.tce.rs.gov.br'
export const PREFIXO_DO_FONTE_ID_TCE_RS = 'TCE-RS-'
export const ARQUIVO_DAS_LICITACOES = 'licitacao.csv'
export const ARQUIVO_DOS_EVENTOS = 'evento_lic.csv'
export const ARQUIVO_DOS_DOCUMENTOS = 'documento_lic.csv'
export const FASE_DO_EDITAL_PUBLICADO = 'EPU'
export const HOST_DOS_DOCUMENTOS_DO_TCE_RS = 'portal.tce.rs.gov.br'

const UF_DO_RIO_GRANDE_DO_SUL = 'RS'
const CAPITAL_DO_RIO_GRANDE_DO_SUL = 'PORTO ALEGRE'
const PRIMEIRO_CODIGO_SEM_PREFIXO_MUNICIPAL = 88_000
const MAX_ANEXOS = 10
const MAX_PUBLICACOES = 10
const MAX_TEXTO_DA_PUBLICACAO = 300
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/
const CARIMBO_DO_ARQUIVO = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/
const EDITAL_NO_PNCP = /pncp\.gov\.br\/(?:app\/)?editais\/(\d{14})\/(\d{4})\/(\d{1,6})(?!\d)/i
const ORGAO_MUNICIPAL = /^(PM|CM) DE (.+)$/
const SEPARADOR_DO_MUNICIPIO_NO_NOME = /(?:\s-\s|\sDE\s)/g
const REGIAO_ANTES_DO_NOME = /(?:VALE|REGIAO|REGIOES|BACIA|RIO|SERRA|CAMPOS)\s*$/
const CONSORCIO = /(?:^|[\s/(-])(?:CONS\.|CONSORCIO|CONSÓRCIO|CI)(?=[\s/.-])/
const MARCA_DE_ORDEM_DOS_BYTES = 0xfeff
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

const NOMES_OFICIAIS: Record<string, string> = {
  'santana do livramento': "Sant'Ana do Livramento",
}

const MODALIDADES: Record<string, ModalidadeEnum> = {
  PCE: 'PREGAO_ELETRONICO',
  PCP: 'PREGAO_PRESENCIAL',
  CCE: 'CONCORRENCIA',
  CCP: 'CONCORRENCIA',
  PDE: 'DISPENSA_COM_DISPUTA',
  CPC: 'CREDENCIAMENTO',
  CNS: 'CONCURSO',
  TMP: 'TOMADA_DE_PRECOS',
}

export const MODALIDADES_SEM_DISPUTA_NO_LICITACON = new Set(['PRD', 'PRI', 'RPO', 'CHP'])

const SITUACAO_DO_RESULTADO: Record<string, SituacaoEnum> = {
  R: 'REVOGADA',
  N: 'ANULADA',
  D: 'ENCERRADA',
  F: 'ENCERRADA',
}

const SITUACAO_DO_EVENTO: Record<string, SituacaoEnum> = {
  SUO: 'SUSPENSA',
  SUM: 'SUSPENSA',
  SDJ: 'SUSPENSA',
  REI: 'ABERTA',
  REO: 'REVOGADA',
  ANO: 'ANULADA',
}

const SITUACAO_DA_FASE: Record<string, SituacaoEnum> = {
  HAP: 'ENCERRADA',
  ADH: 'HOMOLOGADA',
}

const EVENTOS_DE_PUBLICACAO = new Set(['PUE', 'REE', 'AED'])
const ORDEM_DOS_ANEXOS = ['EDI', 'PBT', 'ETP', 'OCB', 'DBD', 'CRN', 'DES', 'OUT']

const VEICULOS: Record<string, string> = {
  P: 'PNCP',
  J: 'Jornal',
  E: 'Diário Oficial do Estado',
  U: 'Diário Oficial da União',
  M: 'Mural',
  S: 'Sítio oficial',
  I: 'Internet',
}

export const COLUNAS_DA_LICITACAO = ['CD_ORGAO', 'NM_ORGAO', 'NR_LICITACAO', 'ANO_LICITACAO', 'CD_TIPO_MODALIDADE', 'CD_TIPO_FASE_ATUAL', 'DS_OBJETO', 'DT_ABERTURA']
export const COLUNAS_DO_EVENTO = ['CD_ORGAO', 'NR_LICITACAO', 'ANO_LICITACAO', 'CD_TIPO_MODALIDADE', 'SQ_EVENTO', 'CD_TIPO_EVENTO', 'DT_EVENTO']
export const COLUNAS_DO_DOCUMENTO = ['CD_ORGAO', 'NR_LICITACAO', 'ANO_LICITACAO', 'CD_TIPO_MODALIDADE', 'CD_TIPO_DOCUMENTO', 'NOME_ARQUIVO_DOCUMENTO', 'ARQUIVO_URL_DOWNLOAD']

export type ValorDaColuna = (coluna: string) => string

export interface LicitacaoDoLicitaCon {
  chave: string
  cdOrgao: number
  nomeDoOrgao: string
  numero: string
  ano: number
  modalidade: string
  fase: string
  resultado: string
  numeroDoProcesso: string
  anoDoProcesso: string
  objeto: string
  valor?: number
  orcamentoSigiloso: boolean
  abertura: string
  linkCidadao: string
  tipoDeDisputa: string
}

export interface EventoDoLicitaCon {
  chave: string
  sequencia: number
  fase: string
  tipo: string
  data: string
  veiculo: string
  publicacao: string
}

export interface DocumentoDoLicitaCon {
  chave: string
  tipo: string
  nome: string
  fase: string
  enviadoEm: string
  url: string
}

export interface MunicipioDoRs {
  nome: string
  codigoIbge: string
  lat: number
  lng: number
}

export interface OrgaoDoRs {
  orgao: string
  municipio: MunicipioDoRs | undefined
  esfera: 'municipal' | 'estadual' | 'regional'
}

export type LeituraDoTceRs = { tipo: 'licitacao'; tender: NormalizedTender } | { tipo: 'ignorado'; motivo: string }

export interface EntradaDoZip {
  nome: string
  metodo: number
  tamanhoComprimido: number
  tamanhoOriginal: number
  inicioDoCabecalho: number
}

export class FormatoInesperadoDoTceRs extends Error {
  constructor(motivo: string) {
    super(`TCE-RS: ${motivo}`)
    this.name = 'FormatoInesperadoDoTceRs'
  }
}

export function caminhoDoArquivoDoAno(ano: number): string {
  return `/dados/licitacon/licitacao/ano/${ano}.csv.zip`
}

export function chaveDoLicitaCon(cdOrgao: number | string, ano: number | string, modalidade: string, numero: string): string {
  return `${String(cdOrgao).trim()}-${String(ano).trim()}-${modalidade.trim()}-${numero.trim()}`
}

export function fonteIdTceRs(chave: string): string {
  return `${PREFIXO_DO_FONTE_ID_TCE_RS}${chave}`
}

export function chaveDoFonteIdTceRs(fonteId: string): string | undefined {
  return fonteId.startsWith(PREFIXO_DO_FONTE_ID_TCE_RS) ? fonteId.slice(PREFIXO_DO_FONTE_ID_TCE_RS.length) : undefined
}

export function anoDoFonteIdTceRs(fonteId: string): number | undefined {
  const m = /^TCE-RS-\d+-(\d{4})-/.exec(fonteId)
  return m ? Number(m[1]) : undefined
}

const ASSINATURA_DO_FIM_DO_DIRETORIO = 0x06054b50
const ASSINATURA_DA_ENTRADA_NO_DIRETORIO = 0x02014b50
const ASSINATURA_DO_CABECALHO_LOCAL = 0x04034b50
const SEM_TAMANHO_ZIP64 = 0xffffffff
export const TAMANHO_DO_CABECALHO_LOCAL = 30

export function entradasDoZip(cauda: Buffer, inicioDaCauda: number): EntradaDoZip[] {
  let fim = -1
  for (let i = cauda.length - 22; i >= 0; i--) {
    if (cauda.readUInt32LE(i) === ASSINATURA_DO_FIM_DO_DIRETORIO) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new FormatoInesperadoDoTceRs('fim do diretório do ZIP não encontrado')
  const total = cauda.readUInt16LE(fim + 10)
  const inicioDoDiretorio = cauda.readUInt32LE(fim + 16)
  if (inicioDoDiretorio === SEM_TAMANHO_ZIP64) throw new FormatoInesperadoDoTceRs('ZIP64 não suportado')
  let p = inicioDoDiretorio - inicioDaCauda
  if (p < 0) throw new FormatoInesperadoDoTceRs('diretório do ZIP maior que o trecho lido')
  const entradas: EntradaDoZip[] = []
  for (let k = 0; k < total; k++) {
    if (p + 46 > cauda.length || cauda.readUInt32LE(p) !== ASSINATURA_DA_ENTRADA_NO_DIRETORIO) {
      throw new FormatoInesperadoDoTceRs('entrada do diretório do ZIP corrompida')
    }
    const tamanhoDoNome = cauda.readUInt16LE(p + 28)
    const tamanhoDoExtra = cauda.readUInt16LE(p + 30)
    const tamanhoDoComentario = cauda.readUInt16LE(p + 32)
    const entrada: EntradaDoZip = {
      nome: cauda.subarray(p + 46, p + 46 + tamanhoDoNome).toString('utf8'),
      metodo: cauda.readUInt16LE(p + 10),
      tamanhoComprimido: cauda.readUInt32LE(p + 20),
      tamanhoOriginal: cauda.readUInt32LE(p + 24),
      inicioDoCabecalho: cauda.readUInt32LE(p + 42),
    }
    if ([entrada.tamanhoComprimido, entrada.tamanhoOriginal, entrada.inicioDoCabecalho].includes(SEM_TAMANHO_ZIP64)) {
      throw new FormatoInesperadoDoTceRs('ZIP64 não suportado')
    }
    entradas.push(entrada)
    p += 46 + tamanhoDoNome + tamanhoDoExtra + tamanhoDoComentario
  }
  return entradas
}

export function inicioDosDadosDaEntrada(cabecalho: Buffer): number {
  if (cabecalho.length < TAMANHO_DO_CABECALHO_LOCAL || cabecalho.readUInt32LE(0) !== ASSINATURA_DO_CABECALHO_LOCAL) {
    throw new FormatoInesperadoDoTceRs('cabeçalho local do ZIP inválido')
  }
  return TAMANHO_DO_CABECALHO_LOCAL + cabecalho.readUInt16LE(26) + cabecalho.readUInt16LE(28)
}

export class LeitorDeCsv {
  private campo = ''
  private campos: string[] = []
  private entreAspas = false
  private aspaPendente = false
  private primeiroPedaco = true

  constructor(private readonly aoLerLinha: (campos: string[]) => void) {}

  ler(pedaco: string): void {
    let texto = pedaco
    if (this.primeiroPedaco && texto.length > 0) {
      if (texto.charCodeAt(0) === MARCA_DE_ORDEM_DOS_BYTES) texto = texto.slice(1)
      this.primeiroPedaco = false
    }
    let inicio = 0
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i)
      if (this.aspaPendente) {
        this.aspaPendente = false
        if (c === 34) {
          this.campo += '"'
          inicio = i + 1
          continue
        }
        this.entreAspas = false
      }
      if (this.entreAspas) {
        if (c === 34) {
          this.campo += texto.slice(inicio, i)
          this.aspaPendente = true
          inicio = i + 1
        }
        continue
      }
      if (c === 34) {
        this.campo += texto.slice(inicio, i)
        this.entreAspas = true
        inicio = i + 1
      } else if (c === 44) {
        this.campo += texto.slice(inicio, i)
        this.fecharCampo()
        inicio = i + 1
      } else if (c === 10) {
        this.campo += texto.slice(inicio, i)
        this.fecharLinha()
        inicio = i + 1
      } else if (c === 13) {
        this.campo += texto.slice(inicio, i)
        inicio = i + 1
      }
    }
    this.campo += texto.slice(inicio)
  }

  terminar(): void {
    this.aspaPendente = false
    this.entreAspas = false
    if (this.campo !== '' || this.campos.length > 0) this.fecharLinha()
  }

  private fecharCampo(): void {
    this.campos.push(this.campo)
    this.campo = ''
  }

  private fecharLinha(): void {
    this.fecharCampo()
    const campos = this.campos
    this.campos = []
    if (campos.length === 1 && campos[0] === '') return
    this.aoLerLinha(campos)
  }
}

export class LeitorDeTabela {
  private colunas: Map<string, number> | null = null
  private readonly csv: LeitorDeCsv
  linhas = 0

  constructor(
    private readonly obrigatorias: string[],
    private readonly aoLerRegistro: (valor: ValorDaColuna) => void
  ) {
    this.csv = new LeitorDeCsv((campos) => this.linha(campos))
  }

  ler(pedaco: string): void {
    this.csv.ler(pedaco)
  }

  terminar(): void {
    this.csv.terminar()
    if (!this.colunas) throw new FormatoInesperadoDoTceRs('arquivo sem cabeçalho')
  }

  private linha(campos: string[]): void {
    if (!this.colunas) {
      this.colunas = new Map(campos.map((c, i) => [c.trim().toUpperCase(), i]))
      const faltando = this.obrigatorias.filter((c) => !this.colunas?.has(c))
      if (faltando.length > 0) throw new FormatoInesperadoDoTceRs(`colunas ausentes: ${faltando.join(', ')}`)
      return
    }
    this.linhas++
    const colunas = this.colunas
    this.aoLerRegistro((coluna) => {
      const indice = colunas.get(coluna)
      return indice === undefined ? '' : (campos[indice] ?? '').trim()
    })
  }
}

function numeroOuNada(texto: string): number | undefined {
  if (!texto) return undefined
  const valor = Number(texto.replace(',', '.'))
  return Number.isFinite(valor) ? valor : undefined
}

export function licitacaoDaLinha(valor: ValorDaColuna): LicitacaoDoLicitaCon | undefined {
  const cdOrgao = Number(valor('CD_ORGAO'))
  const ano = Number(valor('ANO_LICITACAO'))
  const numero = valor('NR_LICITACAO')
  const modalidade = valor('CD_TIPO_MODALIDADE').toUpperCase()
  if (!Number.isSafeInteger(cdOrgao) || cdOrgao <= 0 || !Number.isSafeInteger(ano) || !numero || !modalidade) return undefined
  const sigiloso = valor('BL_ORCAMENTO_SIGILOSO').toUpperCase() === 'S'
  const valorEstimado = numeroOuNada(valor('VL_LICITACAO'))
  return {
    chave: chaveDoLicitaCon(cdOrgao, ano, modalidade, numero),
    cdOrgao,
    nomeDoOrgao: limparTexto(valor('NM_ORGAO')),
    numero,
    ano,
    modalidade,
    fase: valor('CD_TIPO_FASE_ATUAL').toUpperCase(),
    resultado: valor('TP_RESULTADO_GLOBAL').toUpperCase(),
    numeroDoProcesso: valor('NR_PROCESSO'),
    anoDoProcesso: valor('ANO_PROCESSO'),
    objeto: limparTexto(valor('DS_OBJETO')),
    valor: !sigiloso && valorEstimado !== undefined && valorEstimado > 0 ? valorEstimado : undefined,
    orcamentoSigiloso: sigiloso,
    abertura: valor('DT_ABERTURA'),
    linkCidadao: valor('LINK_LICITACON_CIDADAO'),
    tipoDeDisputa: valor('TP_DISPUTA'),
  }
}

export function eventoDaLinha(valor: ValorDaColuna): EventoDoLicitaCon | undefined {
  const numero = valor('NR_LICITACAO')
  const modalidade = valor('CD_TIPO_MODALIDADE').toUpperCase()
  if (!numero || !modalidade) return undefined
  return {
    chave: chaveDoLicitaCon(valor('CD_ORGAO'), valor('ANO_LICITACAO'), modalidade, numero),
    sequencia: Number(valor('SQ_EVENTO')) || 0,
    fase: valor('CD_TIPO_FASE').toUpperCase(),
    tipo: valor('CD_TIPO_EVENTO').toUpperCase(),
    data: valor('DT_EVENTO'),
    veiculo: valor('TP_VEICULO_PUBLICACAO').toUpperCase(),
    publicacao: limparTexto(valor('DS_PUBLICACAO')),
  }
}

export function documentoDaLinha(valor: ValorDaColuna): DocumentoDoLicitaCon | undefined {
  const numero = valor('NR_LICITACAO')
  const modalidade = valor('CD_TIPO_MODALIDADE').toUpperCase()
  const url = valor('ARQUIVO_URL_DOWNLOAD')
  if (!numero || !modalidade || !urlDeDocumentoDoTceRs(url)) return undefined
  return {
    chave: chaveDoLicitaCon(valor('CD_ORGAO'), valor('ANO_LICITACAO'), modalidade, numero),
    tipo: valor('CD_TIPO_DOCUMENTO').toUpperCase(),
    nome: limparTexto(valor('NOME_ARQUIVO_DOCUMENTO')),
    fase: valor('CD_TIPO_FASE').toUpperCase(),
    enviadoEm: valor('ARQUIVO_TIMESTAMP'),
    url,
  }
}

export function urlDeDocumentoDoTceRs(url: string): boolean {
  try {
    const endereco = new URL(url)
    return endereco.protocol === 'https:' && endereco.hostname.toLowerCase() === HOST_DOS_DOCUMENTOS_DO_TCE_RS
  } catch {
    return false
  }
}

export function diaDoLicitaCon(texto: string | undefined): Date | undefined {
  const m = DATA_ISO.exec(texto ?? '')
  if (!m) return undefined
  return dataPlausivel(horaDeBrasilia(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function carimboDoArquivo(texto: string): Date | undefined {
  const m = CARIMBO_DO_ARQUIVO.exec(texto)
  if (!m) return undefined
  return dataPlausivel(horaDeBrasilia(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])))
}

export function ehCandidataDoTceRs(licitacao: LicitacaoDoLicitaCon, agora: Date): boolean {
  if (licitacao.fase !== FASE_DO_EDITAL_PUBLICADO || MODALIDADES_SEM_DISPUTA_NO_LICITACON.has(licitacao.modalidade)) return false
  if (SITUACAO_DO_RESULTADO[licitacao.resultado]) return false
  const sessao = diaDoLicitaCon(licitacao.abertura)
  return !!sessao && sessao.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export function modalidadeDoLicitaCon(codigo: string): ModalidadeEnum {
  return MODALIDADES[codigo.toUpperCase()] ?? 'OUTROS'
}

export function situacaoDoLicitaCon(licitacao: Pick<LicitacaoDoLicitaCon, 'fase' | 'resultado'>, eventos: EventoDoLicitaCon[]): SituacaoEnum | undefined {
  const doResultado = SITUACAO_DO_RESULTADO[licitacao.resultado]
  if (doResultado) return doResultado
  const daFase = SITUACAO_DA_FASE[licitacao.fase]
  if (daFase) return daFase
  if (licitacao.fase !== FASE_DO_EDITAL_PUBLICADO) return undefined
  const decisivos = eventos.filter((e) => SITUACAO_DO_EVENTO[e.tipo]).sort((a, b) => a.sequencia - b.sequencia)
  const ultimo = decisivos[decisivos.length - 1]
  return ultimo ? SITUACAO_DO_EVENTO[ultimo.tipo] : 'ABERTA'
}

export function nomeDeMunicipioLegivel(nome: string): string {
  const oficial = NOMES_OFICIAIS[normalize(nome)]
  if (oficial) return oficial
  return limparTexto(nome)
    .toLowerCase()
    .split(' ')
    .map((palavra, i) =>
      i > 0 && PARTICULAS.has(palavra) ? palavra : palavra.replace(/(^|-)(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase())
    )
    .join(' ')
}

export function municipioDoRs(nome: string): MunicipioDoRs | undefined {
  const limpo = limparTexto(nome)
  if (!limpo) return undefined
  const oficial = NOMES_OFICIAIS[normalize(limpo)]
  const geo = findMunicipioByNomeUf(oficial ?? limpo, UF_DO_RIO_GRANDE_DO_SUL)
  if (!geo) return undefined
  return { nome: nomeDeMunicipioLegivel(limpo), codigoIbge: geo.codigoIbge, lat: geo.lat, lng: geo.lng }
}

export function prefeituraDaLinha(cdOrgao: number, nomeDoOrgao: string): [number, string] | undefined {
  const m = ORGAO_MUNICIPAL.exec(nomeDoOrgao)
  return m && m[1] === 'PM' ? [cdOrgao, limparTexto(m[2])] : undefined
}

function municipioNoFimDoNome(nomeDoOrgao: string): MunicipioDoRs | undefined {
  const nome = normalize(nomeDoOrgao).toUpperCase().replace(/\s+/g, ' ')
  for (const separador of nome.matchAll(SEPARADOR_DO_MUNICIPIO_NO_NOME)) {
    const antes = nome.slice(0, separador.index)
    if (REGIAO_ANTES_DO_NOME.test(antes)) continue
    const depois = nome.slice((separador.index ?? 0) + separador[0].length).replace(/[.\s]+$/, '')
    const municipio = municipioDoRs(depois)
    if (municipio) {
      const original = limparTexto(nomeDoOrgao).slice(-depois.length)
      return { ...municipio, nome: nomeDeMunicipioLegivel(original) }
    }
  }
  return undefined
}

export function orgaoDoRs(cdOrgao: number, nomeDoOrgao: string, prefeituras: Map<number, string>): OrgaoDoRs {
  const nome = limparTexto(nomeDoOrgao)
  const municipal = ORGAO_MUNICIPAL.exec(nome)
  if (municipal) {
    const municipio = municipioDoRs(municipal[2])
    const cidade = municipio?.nome ?? nomeDeMunicipioLegivel(municipal[2])
    return { orgao: `${municipal[1] === 'PM' ? 'Prefeitura Municipal' : 'Câmara Municipal'} de ${cidade}`, municipio, esfera: 'municipal' }
  }
  if (cdOrgao < PRIMEIRO_CODIGO_SEM_PREFIXO_MUNICIPAL) {
    const daPrefeitura = prefeituras.get(Math.floor(cdOrgao / 100) * 100)
    const municipio = daPrefeitura ? municipioDoRs(daPrefeitura) : undefined
    if (municipio) return { orgao: nome, municipio, esfera: 'municipal' }
  }
  const noNome = municipioNoFimDoNome(nome)
  if (noNome) return { orgao: nome, municipio: noNome, esfera: 'municipal' }
  if (CONSORCIO.test(nome.toUpperCase())) return { orgao: nome, municipio: undefined, esfera: 'regional' }
  return { orgao: nome, municipio: municipioDoRs(CAPITAL_DO_RIO_GRANDE_DO_SUL), esfera: 'estadual' }
}

export function controleNoPncp(eventos: EventoDoLicitaCon[]): string | undefined {
  const ordenados = [...eventos].filter((e) => EVENTOS_DE_PUBLICACAO.has(e.tipo)).sort((a, b) => b.sequencia - a.sequencia)
  for (const evento of ordenados) {
    const m = EDITAL_NO_PNCP.exec(evento.publicacao)
    if (m) return `${m[1]}-1-${m[3].padStart(6, '0')}/${m[2]}`
  }
  return undefined
}

export function publicadoNoPncpSegundoOLicitaCon(eventos: EventoDoLicitaCon[]): boolean {
  return eventos.some((e) => EVENTOS_DE_PUBLICACAO.has(e.tipo) && (e.veiculo === 'P' || /\bpncp\b/i.test(e.publicacao)))
}

export function publicacaoDoEdital(eventos: EventoDoLicitaCon[]): Date | undefined {
  const datas = eventos
    .filter((e) => e.tipo === 'PUE')
    .map((e) => diaDoLicitaCon(e.data))
    .filter((d): d is Date => !!d)
    .map((d) => d.getTime())
  return datas.length > 0 ? new Date(Math.min(...datas)) : undefined
}

export function anexosDoTceRs(documentos: DocumentoDoLicitaCon[]): { uri: string; titulo: string; tipo: string }[] {
  const posicao = (tipo: string) => {
    const i = ORDEM_DOS_ANEXOS.indexOf(tipo)
    return i < 0 ? ORDEM_DOS_ANEXOS.length : i
  }
  const vistos = new Set<string>()
  return [...documentos]
    .filter((d) => posicao(d.tipo) < ORDEM_DOS_ANEXOS.length)
    .sort((a, b) => posicao(a.tipo) - posicao(b.tipo) || b.enviadoEm.localeCompare(a.enviadoEm))
    .filter((d) => (vistos.has(d.url) ? false : (vistos.add(d.url), true)))
    .slice(0, MAX_ANEXOS)
    .map((d) => ({ uri: d.url, titulo: d.nome || 'Documento', tipo: d.tipo }))
}

function publicacoesResumidas(eventos: EventoDoLicitaCon[]) {
  return [...eventos]
    .filter((e) => EVENTOS_DE_PUBLICACAO.has(e.tipo))
    .sort((a, b) => a.sequencia - b.sequencia)
    .slice(-MAX_PUBLICACOES)
    .map((e) => ({ tipo: e.tipo, data: e.data, veiculo: VEICULOS[e.veiculo] ?? (e.veiculo || null), descricao: truncar(e.publicacao, MAX_TEXTO_DA_PUBLICACAO) || null }))
}

function numeroComAno(numero: string, ano: string | number): string {
  const limpo = limparTexto(numero)
  if (!limpo) return ''
  const anoTexto = String(ano).trim()
  return anoTexto && !limpo.includes(anoTexto) ? `${limpo}/${anoTexto.length === 2 ? `20${anoTexto}` : anoTexto}` : limpo
}

export function tenderDoTceRs(
  licitacao: LicitacaoDoLicitaCon,
  eventos: EventoDoLicitaCon[],
  documentos: DocumentoDoLicitaCon[],
  prefeituras: Map<number, string>
): LeituraDoTceRs {
  if (!licitacao.objeto) return { tipo: 'ignorado', motivo: 'sem objeto' }
  const situacao = situacaoDoLicitaCon(licitacao, eventos)
  if (!situacao) return { tipo: 'ignorado', motivo: `fase sem situação conhecida (${licitacao.fase || 'vazia'})` }
  const aberturaAt = diaDoLicitaCon(licitacao.abertura)
  if (!aberturaAt) return { tipo: 'ignorado', motivo: 'sem data de abertura' }

  const { orgao, municipio, esfera } = orgaoDoRs(licitacao.cdOrgao, licitacao.nomeDoOrgao, prefeituras)
  const anexos = anexosDoTceRs(documentos)
  const editalMaisRecente = documentos.filter((d) => d.tipo === 'EDI').sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))[0]
  const numero = numeroComAno(licitacao.numero, licitacao.ano)
  const processo = numeroComAno(licitacao.numeroDoProcesso, licitacao.anoDoProcesso)

  const tender: NormalizedTender = {
    fonte: 'TCE_RS',
    fonteId: fonteIdTceRs(licitacao.chave),
    modalidade: modalidadeDoLicitaCon(licitacao.modalidade),
    situacao,
    objeto: licitacao.objeto,
    objetoResumido: truncar(licitacao.objeto),
    valorEstimado: licitacao.valor,
    srp: /registro de pre[cç]os?/i.test(licitacao.objeto) ? true : undefined,
    uf: UF_DO_RIO_GRANDE_DO_SUL,
    municipio: municipio?.nome,
    municipioIbge: municipio?.codigoIbge,
    municipioLat: municipio?.lat,
    municipioLng: municipio?.lng,
    orgao,
    aberturaAt,
    publicadoAt: publicacaoDoEdital(eventos),
    linkEdital: licitacao.linkCidadao || editalMaisRecente?.url || undefined,
    numeroControle: numero || undefined,
    rawJson: {
      chave: licitacao.chave,
      cdOrgao: licitacao.cdOrgao,
      nomeDoOrgaoNaOrigem: licitacao.nomeDoOrgao,
      esfera,
      numero,
      processoAdministrativo: processo || null,
      modalidadeNaOrigem: licitacao.modalidade,
      faseNaOrigem: licitacao.fase,
      resultadoNaOrigem: licitacao.resultado || null,
      tipoDeDisputa: licitacao.tipoDeDisputa || null,
      orcamentoSigiloso: licitacao.orcamentoSigiloso,
      controlePncp: controleNoPncp(eventos) ?? null,
      publicadoNoPncp: publicadoNoPncpSegundoOLicitaCon(eventos),
      publicacoes: publicacoesResumidas(eventos),
      editalEnviadoEm: editalMaisRecente ? (carimboDoArquivo(editalMaisRecente.enviadoEm)?.toISOString() ?? null) : null,
      anexos,
    },
  }
  return { tipo: 'licitacao', tender }
}
