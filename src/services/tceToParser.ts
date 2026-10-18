import * as cheerio from 'cheerio'
import { ModalidadeEnum, NormalizedTender, SituacaoEnum } from '../types'
import { DESLOCAMENTO_DE_BRASILIA_MS, horaDeBrasilia, inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { dataPlausivel } from '../lib/dataPlausivel'
import { getMunicipioByIbge, normalize } from '../lib/geoService'
import { limparTexto, truncar } from './sescRegional/tipos'
import { NOMES_DOS_MUNICIPIOS_DO_TOCANTINS } from './tceToMunicipios'

export const TCE_TO_ORIGEM = 'https://app.tceto.tc.br'
export const PREFIXO_DO_FONTE_ID_TCE_TO = 'TCE-TO-'
export const ESFERA_MUNICIPAL = 2

const UF_DO_TOCANTINS = 'TO'
const CONTROLADOR = '/sicap/lco/jurisdicionado/auditor/app/controllers/'
const CLASSE_DOS_PROCEDIMENTOS = 'TCE_sicap_lco_jurisdicionado_auditor_ProcedimentosPublico'
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const MAX_PUBLICACOES = 20

export interface LinhaDaListaTceTo {
  idProcedimento: number
  cnpj?: string
  unidadeGestora: string
  tipoProcedimento: string
  processoAdministrativo?: string
  numeroLicitatorio?: string
  anoLicitatorio?: string
  fases?: string
  valorEstimado?: number
  cadastradoEm?: string
  aberturaEm?: string
  primeiraPublicacaoEm?: string
  objeto: string
  codigoIbge: string
  esfera: number
  relatoria?: number
  modalidade: string
  registroDePreco: boolean
  dispensaEletronica: boolean
  credenciamento: boolean
  situacaoNaOrigem: string
  ativo: boolean
  orcamentoSigiloso: boolean
}

export interface PaginaDaListaTceTo {
  linhas: LinhaDaListaTceTo[]
  total: number | null
}

export interface PublicacaoDoTceTo {
  veiculo: string
  data?: string
  complemento?: string
}

export interface DetalheDoTceTo {
  ativo: boolean
  situacao: string
  situacaoDaSegundaFase: string
  aberturaEm?: string
  linkDaSessao?: string
  criterioDeJulgamento?: string
  regime?: string
  quantidadeDeItens?: number
  naturezas: string[]
  publicacoes: PublicacaoDoTceTo[]
}

export type LeituraDoTceTo = { tipo: 'licitacao'; tender: NormalizedTender } | { tipo: 'ignorado'; motivo: string }

const SITUACOES: { padrao: RegExp; situacao: SituacaoEnum }[] = [
  { padrao: /^$/, situacao: 'ABERTA' },
  { padrao: /^(aberta|aberto|em andamento|publicada|publicado|em aberto)/, situacao: 'ABERTA' },
  { padrao: /^(suspens|adiad)/, situacao: 'SUSPENSA' },
  { padrao: /^cancelad/, situacao: 'CANCELADA' },
  { padrao: /^revogad/, situacao: 'REVOGADA' },
  { padrao: /^anulad/, situacao: 'ANULADA' },
  { padrao: /^(homologad|adjudicad)/, situacao: 'HOMOLOGADA' },
  { padrao: /^(desert|fracassad|encerrad|concluid|fechad|finalizad)/, situacao: 'ENCERRADA' },
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

function dataBrDe(data: Date): string {
  const local = new Date(data.getTime() - DESLOCAMENTO_DE_BRASILIA_MS)
  const dia = String(local.getUTCDate()).padStart(2, '0')
  const mes = String(local.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${local.getUTCFullYear()}`
}

export function caminhoDaListaTceTo(pagina: number, limite: number, inicio: Date, fim: Date): string {
  const busca = new URLSearchParams({
    c: CLASSE_DOS_PROCEDIMENTOS,
    m: 'listarProcedimentos',
    tipoordenacao: 'procedimento',
    ordem: 'DESC',
    tipodata: 'abertura',
    databrinicio: dataBrDe(inicio),
    databrfim: dataBrDe(fim),
    page: String(pagina),
    limit: String(limite),
    start: String((pagina - 1) * limite),
  })
  return `${CONTROLADOR}?${busca.toString()}`
}

export function caminhoDoDetalheTceTo(idProcedimento: number): string {
  const busca = new URLSearchParams({ c: CLASSE_DOS_PROCEDIMENTOS, m: 'detalharPrimeiraFase', idProcedimento: String(idProcedimento) })
  return `${CONTROLADOR}?${busca.toString()}`
}

export function urlPublicaDoTceTo(idProcedimento: number): string {
  return `${TCE_TO_ORIGEM}/lo_publico/pesquisar/detalhes?idProcedimento=${idProcedimento}`
}

export function fonteIdTceTo(idProcedimento: number): string {
  return `${PREFIXO_DO_FONTE_ID_TCE_TO}${idProcedimento}`
}

export function idDoProcedimentoTceTo(fonteId: string): number | undefined {
  const m = fonteId.match(/^TCE-TO-(\d+)$/)
  return m ? Number(m[1]) : undefined
}

export function textoDoTceTo(valor: unknown): string {
  if (typeof valor !== 'string' && typeof valor !== 'number') return ''
  const bruto = String(valor)
  const decodificado = /&[#a-z0-9]+;/i.test(bruto) ? cheerio.load(`<p>${bruto.replace(/</g, '&lt;')}</p>`)('p').text() : bruto
  return limparTexto(decodificado)
}

function textoOuIndefinido(valor: unknown): string | undefined {
  return textoDoTceTo(valor) || undefined
}

function numeroOuIndefinido(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return undefined
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : undefined
}

function verdadeiro(valor: unknown): boolean {
  return valor === true || valor === 1 || valor === '1' || valor === 'true'
}

export function diaDoTceTo(data: string | undefined): Date | undefined {
  const m = data?.trim().match(DATA_BR)
  if (!m) return undefined
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const mes = Number(m[2])
  const dia = Number(m[1])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return undefined
  return dataPlausivel(horaDeBrasilia(ano, mes - 1, dia))
}

function numeroComAno(numero: string | undefined, ano: string | undefined): string | undefined {
  if (!numero) return undefined
  return ano ? `${numero}/${ano}` : numero
}

function linhaDoJson(item: Record<string, unknown>): LinhaDaListaTceTo | null {
  const idProcedimento = Number(item.idProcedimento)
  const codigoIbge = textoDoTceTo(item.codmunicipio)
  const objeto = textoDoTceTo(item.objeto)
  if (!Number.isSafeInteger(idProcedimento) || idProcedimento <= 0 || !codigoIbge || !objeto) return null
  return {
    idProcedimento,
    cnpj: textoOuIndefinido(item.cnpjuni),
    unidadeGestora: textoDoTceTo(item.nomeuni),
    tipoProcedimento: textoDoTceTo(item.tipoProcedimento),
    processoAdministrativo: numeroComAno(textoOuIndefinido(item.numProcessoAdministrativo), textoOuIndefinido(item.anoProcessoAdministrativo)),
    numeroLicitatorio: textoOuIndefinido(item.numeroLicitatorio),
    anoLicitatorio: textoOuIndefinido(item.anoLicitatorio),
    fases: textoOuIndefinido(item.fases),
    valorEstimado: numeroOuIndefinido(item.valorEstimado),
    cadastradoEm: textoOuIndefinido(item.dataCadastroProcedimento),
    aberturaEm: textoOuIndefinido(item.dataAberturaEvento),
    primeiraPublicacaoEm: textoOuIndefinido(item.primeiraPublicacao),
    objeto,
    codigoIbge,
    esfera: Number(item.codesfera),
    relatoria: numeroOuIndefinido(item.codrelatoria),
    modalidade: textoDoTceTo(item.modalidade),
    registroDePreco: verdadeiro(item.isregistropreco),
    dispensaEletronica: verdadeiro(item.esdispensaeletronica),
    credenciamento: verdadeiro(item.iscredenciamento),
    situacaoNaOrigem: textoDoTceTo(item.situacao_2fase),
    ativo: item.ativoProcedimento === undefined ? true : verdadeiro(item.ativoProcedimento),
    orcamentoSigiloso: verdadeiro(item.sigiloso),
  }
}

function jsonDoTceTo(texto: string, oQue: string): Record<string, unknown> {
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error(`TCE-TO: ${oQue} não veio em JSON`)
  }
  const objeto = json as { success?: unknown; raiz?: unknown } | null
  if (!objeto || typeof objeto !== 'object' || objeto.success !== true || !objeto.raiz || typeof objeto.raiz !== 'object') {
    throw new Error(`TCE-TO: ${oQue} fora do formato esperado`)
  }
  return objeto as Record<string, unknown>
}

export function parseListaTceTo(texto: string): PaginaDaListaTceTo {
  const json = jsonDoTceTo(texto, 'lista de procedimentos')
  if (!Array.isArray(json.raiz)) throw new Error('TCE-TO: lista de procedimentos fora do formato esperado')
  const linhas = (json.raiz as Record<string, unknown>[]).map(linhaDoJson).filter((l): l is LinhaDaListaTceTo => l !== null)
  const total = Number(json.total)
  return { linhas, total: Number.isSafeInteger(total) && total >= 0 ? total : null }
}

function respostas(bloco: unknown): Record<string, unknown>[] {
  const lista = (bloco as { resposta?: unknown } | null)?.resposta
  return Array.isArray(lista) ? (lista as Record<string, unknown>[]) : []
}

function semTraco(valor: unknown): string | undefined {
  const texto = textoDoTceTo(valor)
  return texto && texto !== '-' && texto !== '*' ? texto : undefined
}

export function parseDetalheTceTo(texto: string): DetalheDoTceTo {
  const raiz = jsonDoTceTo(texto, 'detalhe do procedimento').raiz as Record<string, unknown>
  const licitacao = raiz.Licitacoes as Record<string, unknown> | undefined
  const unidade = raiz.DadosUnidadeGestora as Record<string, unknown> | undefined
  if (!licitacao || typeof licitacao !== 'object') throw new Error('TCE-TO: detalhe do procedimento sem os dados da licitação')

  const publicacoes = respostas(raiz.Publicacoes)
    .filter((p) => p.ativo === undefined || verdadeiro(p.ativo))
    .slice(0, MAX_PUBLICACOES)
    .flatMap((p): PublicacaoDoTceTo[] => {
      const veiculo = textoDoTceTo(p.idveiculopublicacao)
      if (!veiculo) return []
      const data = semTraco(p.datapublicacao)
      const complemento = semTraco(p.complemento)
      return [{ veiculo, ...(data ? { data } : {}), ...(complemento ? { complemento } : {}) }]
    })

  return {
    ativo: unidade?.procedimentoAtivo === undefined ? true : verdadeiro(unidade.procedimentoAtivo),
    situacao: textoDoTceTo(licitacao.situacao),
    situacaoDaSegundaFase: textoDoTceTo(raiz.situacao2Fase),
    aberturaEm: textoOuIndefinido(licitacao.dataAberturaEvento),
    linkDaSessao: semTraco(licitacao.linksessao),
    criterioDeJulgamento: textoOuIndefinido(licitacao.TipoLicitacao),
    regime: textoOuIndefinido(licitacao.regime),
    quantidadeDeItens: numeroOuIndefinido(licitacao.quantidadeItem),
    naturezas: respostas(raiz.ProcedimentoNatureza).map((n) => textoDoTceTo(n.descricaonaturezaobjeto)).filter(Boolean),
    publicacoes,
  }
}

export function situacaoDoTceTo(texto: string): SituacaoEnum | undefined {
  const chave = normalize(limparTexto(texto)).replace(/[.;:]+$/, '')
  return SITUACOES.find((s) => s.padrao.test(chave))?.situacao
}

export function modalidadeDoTceTo(linha: Pick<LinhaDaListaTceTo, 'modalidade' | 'dispensaEletronica' | 'credenciamento'>): ModalidadeEnum {
  if (linha.dispensaEletronica) return 'DISPENSA_COM_DISPUTA'
  if (linha.credenciamento) return 'CREDENCIAMENTO'
  const chave = normalize(limparTexto(linha.modalidade))
  if (/^pregao/.test(chave)) return /presencial/.test(chave) ? 'PREGAO_PRESENCIAL' : 'PREGAO_ELETRONICO'
  return MODALIDADES.find((m) => m.padrao.test(chave))?.modalidade ?? 'OUTROS'
}

export function municipioDoTocantins(codigoIbge: string): { nome: string; codigoIbge: string; lat: number; lng: number } | undefined {
  const nome = NOMES_DOS_MUNICIPIOS_DO_TOCANTINS[codigoIbge]
  const geo = getMunicipioByIbge(codigoIbge)
  if (!nome || !geo || geo.uf !== UF_DO_TOCANTINS) return undefined
  return { nome, codigoIbge, lat: geo.lat, lng: geo.lng }
}

function palavraEmTitulo(palavra: string, indice: number): string {
  if (indice > 0 && CONECTIVOS.has(palavra)) return palavra
  return palavra.charAt(0).toUpperCase() + palavra.slice(1)
}

export function orgaoDoTceTo(unidadeGestora: string, municipio: string): string {
  const palavras = limparTexto(unidadeGestora).toLocaleLowerCase('pt-BR').split(' ').filter(Boolean).map(palavraEmTitulo)
  if (palavras.length === 0) return `Prefeitura Municipal de ${municipio}`
  const doMunicipio = municipio.split(' ')
  const final = palavras.slice(-doMunicipio.length)
  const terminaNoMunicipio = palavras.length > doMunicipio.length && normalize(final.join(' ')) === normalize(municipio)
  return (terminaNoMunicipio ? [...palavras.slice(0, -doMunicipio.length), ...doMunicipio] : palavras).join(' ')
}

export function linhaComSessaoFutura(linha: LinhaDaListaTceTo, agora: Date): boolean {
  const sessao = diaDoTceTo(linha.aberturaEm)
  return !!sessao && sessao.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export function linhaMunicipal(linha: LinhaDaListaTceTo): boolean {
  return linha.esfera === ESFERA_MUNICIPAL && !!municipioDoTocantins(linha.codigoIbge)
}

export function assinaturaDaLinhaTceTo(linha: LinhaDaListaTceTo): string {
  return [
    linha.idProcedimento,
    linha.numeroLicitatorio ?? '',
    linha.anoLicitatorio ?? '',
    linha.modalidade,
    normalize(linha.objeto),
    linha.aberturaEm ?? '',
    linha.primeiraPublicacaoEm ?? '',
    linha.valorEstimado ?? '',
    linha.situacaoNaOrigem,
    linha.ativo ? 1 : 0,
  ].join('|')
}

export function publicadoNoPncpTceTo(publicacoes: PublicacaoDoTceTo[]): boolean {
  return publicacoes.some((p) => /\bpncp\b|portal nacional de contrata/i.test(`${p.veiculo} ${p.complemento ?? ''}`))
}

function situacaoDaLeitura(linha: LinhaDaListaTceTo, detalhe: DetalheDoTceTo | undefined): SituacaoEnum | undefined {
  if (!linha.ativo || (detalhe && !detalhe.ativo)) return 'CANCELADA'
  const daLista = situacaoDoTceTo(linha.situacaoNaOrigem)
  if (!detalhe) return daLista
  const doDetalhe = situacaoDoTceTo(detalhe.situacaoDaSegundaFase || detalhe.situacao)
  if (doDetalhe && doDetalhe !== 'ABERTA') return doDetalhe
  return daLista
}

export function tenderDoTceTo(linha: LinhaDaListaTceTo, detalhe?: DetalheDoTceTo): LeituraDoTceTo {
  if (linha.esfera !== ESFERA_MUNICIPAL) return { tipo: 'ignorado', motivo: 'unidade estadual' }
  const local = municipioDoTocantins(linha.codigoIbge)
  if (!local) return { tipo: 'ignorado', motivo: `município fora do Tocantins (${linha.codigoIbge})` }
  const situacao = situacaoDaLeitura(linha, detalhe)
  if (!situacao) return { tipo: 'ignorado', motivo: `situação desconhecida (${linha.situacaoNaOrigem})` }
  const aberturaAt = diaDoTceTo(linha.aberturaEm) ?? diaDoTceTo(detalhe?.aberturaEm)
  if (!aberturaAt) return { tipo: 'ignorado', motivo: 'sem data de abertura' }

  const numero = numeroComAno(linha.numeroLicitatorio, linha.anoLicitatorio)
  const publicacoes = detalhe?.publicacoes ?? []
  const srp = linha.registroDePreco || /registro de pre[cç]os?/i.test(linha.objeto) ? true : undefined
  const valorEstimado = !linha.orcamentoSigiloso && linha.valorEstimado && linha.valorEstimado > 0 ? linha.valorEstimado : undefined

  const tender: NormalizedTender = {
    fonte: 'TCE_TO',
    fonteId: fonteIdTceTo(linha.idProcedimento),
    modalidade: modalidadeDoTceTo(linha),
    situacao,
    objeto: linha.objeto,
    objetoResumido: truncar(linha.objeto),
    valorEstimado,
    srp,
    uf: UF_DO_TOCANTINS,
    municipio: local.nome,
    municipioIbge: local.codigoIbge,
    municipioLat: local.lat,
    municipioLng: local.lng,
    orgao: orgaoDoTceTo(linha.unidadeGestora, local.nome),
    orgaoCnpj: linha.cnpj,
    aberturaAt,
    publicadoAt: diaDoTceTo(linha.primeiraPublicacaoEm) ?? diaDoTceTo(linha.cadastradoEm),
    linkEdital: urlPublicaDoTceTo(linha.idProcedimento),
    numeroControle: numero,
    rawJson: {
      idProcedimento: linha.idProcedimento,
      numero: numero ?? null,
      processoAdministrativo: linha.processoAdministrativo ?? null,
      unidadeGestora: linha.unidadeGestora,
      tipoProcedimento: linha.tipoProcedimento,
      modalidadeNaOrigem: linha.modalidade,
      situacaoNaOrigem: linha.situacaoNaOrigem || null,
      fases: linha.fases ?? null,
      relatoria: linha.relatoria ?? null,
      cadastradoNoTceEm: linha.cadastradoEm ?? null,
      primeiraPublicacaoEm: linha.primeiraPublicacaoEm ?? null,
      orcamentoSigiloso: linha.orcamentoSigiloso,
      detalheLido: !!detalhe,
      criterioDeJulgamento: detalhe?.criterioDeJulgamento ?? null,
      regime: detalhe?.regime ?? null,
      quantidadeDeItens: detalhe?.quantidadeDeItens ?? null,
      naturezas: detalhe?.naturezas ?? [],
      linkDaSessao: detalhe?.linkDaSessao ?? null,
      publicacoes,
      publicadoNoPncp: publicadoNoPncpTceTo(publicacoes),
      assinaturaDaLista: assinaturaDaLinhaTceTo(linha),
    },
  }
  return { tipo: 'licitacao', tender }
}

export function tenderProvisorioDaLinhaTceTo(linha: LinhaDaListaTceTo): NormalizedTender | null {
  const leitura = tenderDoTceTo(linha)
  return leitura.tipo === 'licitacao' ? leitura.tender : null
}
