import { FonteEnum, ModalidadeEnum } from '../types'
import { normalize } from './geoService'
import { DESLOCAMENTO_DE_BRASILIA_MS } from './dataDeBrasilia'
import { ehModalidadeCompetitiva } from './dataPlausivel'

export const SIMILARIDADE_MINIMA_PARA_ESCONDER = 0.4
export const SIMILARIDADE_QUE_DISPENSA_CONFIRMACAO = 0.7
const PALAVRAS_EM_COMUM_NO_MESMO_ORGAO = 0.5

export type ComparacaoDoNumero = 'igual' | 'diferente' | 'desconhecido'
export type ConflitoComOPncp = 'modalidade' | 'numero' | 'dia' | 'orgao'
export type TipoDeOrgao = 'prefeitura' | 'camara' | 'estado' | 'outro'

export interface NumeroDoAviso {
  sequencial: number
  ano: string
}

export interface AvisoDeOutraFonte {
  fonte: FonteEnum
  modalidade: ModalidadeEnum
  aberturaAt?: Date | null
  orgao?: string | null
  municipio?: string | null
}

export interface LicitacaoDoPncpComparavel {
  modalidade: ModalidadeEnum
  aberturaAt: Date | null
  encerramentoAt: Date | null
  orgao: string | null
  similaridade: number
}

export interface NumeroDaCompraNoPncp {
  numeroCompra?: string | null
  anoCompra?: string | number | null
  processo?: string | null
}

export interface EntidadeDoOrgao {
  tipo: TipoDeOrgao
  palavras: Set<string>
}

const ORGAO_DA_PREFEITURA = /^(?:prefeitura|municipio|pm |poder executivo|gabinete do prefeito|fundo municipal|fundo (?:de|da|do) |secretaria municipal|secretaria (?:de|da|do) (?!estado))/
const ORGAO_DA_CAMARA = /^(?:camara municipal|camara de vereadores|camara (?:de|da|do) |poder legislativo)/
const ORGAO_DO_ESTADO = /^(?:estado d|governo do estado|secretaria de estado|secretaria estadual)/

const PALAVRAS_GENERICAS_DO_ORGAO = new Set([
  'prefeitura', 'municipal', 'municipio', 'camara', 'vereadores', 'estado', 'governo', 'poder', 'executivo', 'legislativo', 'secretaria',
  'fundo', 'gabinete', 'prefeito', 'para', 'pela', 'pelo', 'publico', 'publica',
])

export function modalidadesEquivalentes(modalidade: ModalidadeEnum): ModalidadeEnum[] {
  if (modalidade === 'PREGAO_ELETRONICO' || modalidade === 'PREGAO_PRESENCIAL') return ['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL']
  if (modalidade === 'DISPENSA_COM_DISPUTA' || modalidade === 'DISPENSA_SEM_DISPUTA') {
    return ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA']
  }
  if (modalidade === 'CREDENCIAMENTO' || modalidade === 'INEXIGIBILIDADE') return ['CREDENCIAMENTO', 'INEXIGIBILIDADE']
  return [modalidade]
}

export function numeroDoAviso(fonteId: string | undefined): NumeroDoAviso | null {
  const m = /:(\d+)-(20\d{2})[A-Z]?(?::|$)/.exec(fonteId ?? '')
  return m ? { sequencial: Number(m[1]), ano: m[2] } : null
}

function familiaDaNumeracao(modalidade: ModalidadeEnum): string {
  if (modalidade === 'PREGAO_ELETRONICO' || modalidade === 'PREGAO_PRESENCIAL') return 'PREGAO'
  if (modalidade === 'DISPENSA_COM_DISPUTA' || modalidade === 'DISPENSA_SEM_DISPUTA') return 'DISPENSA'
  return modalidade
}

export function numeracaoComparavel(a: ModalidadeEnum, b: ModalidadeEnum): boolean {
  return familiaDaNumeracao(a) === familiaDaNumeracao(b)
}

export function numerosDoTexto(texto: string | null | undefined, ano: string): number[] {
  const grupos = (texto ?? '').replace(/(\d)\.(?=\d{3})/g, '$1').match(/\d+/g) ?? []
  const semAnoCompleto = grupos.filter((g) => g !== ano)
  const anoCurto = ano.slice(2)
  const semAnoNoFim = semAnoCompleto.length > 1 && semAnoCompleto[semAnoCompleto.length - 1] === anoCurto ? semAnoCompleto.slice(0, -1) : semAnoCompleto
  return semAnoNoFim.map(Number)
}

function temValor(valor: string | number | null | undefined): boolean {
  return valor !== null && valor !== undefined && String(valor).trim() !== ''
}

export function comparacaoDoNumeroDoAviso(numero: NumeroDoAviso | null, pncp: NumeroDaCompraNoPncp): ComparacaoDoNumero {
  if (!numero) return 'desconhecido'
  const daCompra = numerosDoTexto(pncp.numeroCompra, numero.ano)
  if (daCompra.length === 0) return 'desconhecido'
  if (temValor(pncp.anoCompra) && String(pncp.anoCompra).trim() !== numero.ano) return 'diferente'
  if (daCompra.includes(numero.sequencial) || numerosDoTexto(pncp.processo, numero.ano).includes(numero.sequencial)) return 'igual'
  return 'diferente'
}

function diaEmBrasilia(data: Date): string {
  return new Date(new Date(data).getTime() - DESLOCAMENTO_DE_BRASILIA_MS).toISOString().slice(0, 10)
}

export function comparacaoDoDia(aviso: AvisoDeOutraFonte, pncp: LicitacaoDoPncpComparavel): ComparacaoDoNumero {
  if (!aviso.aberturaAt || !ehModalidadeCompetitiva(aviso.modalidade)) return 'desconhecido'
  const dias = [pncp.aberturaAt, pncp.encerramentoAt].filter((d): d is Date => d !== null && d !== undefined).map(diaEmBrasilia)
  if (dias.length === 0) return 'desconhecido'
  return dias.includes(diaEmBrasilia(aviso.aberturaAt)) ? 'igual' : 'diferente'
}

export function entidadeDoOrgao(orgao: string | null | undefined, municipio?: string | null): EntidadeDoOrgao | null {
  const nome = normalize(orgao ?? '').replace(/[^a-z0-9]+/g, ' ').trim()
  if (!nome) return null
  const tipo: TipoDeOrgao = ORGAO_DO_ESTADO.test(nome) ? 'estado' : ORGAO_DA_CAMARA.test(nome) ? 'camara' : ORGAO_DA_PREFEITURA.test(nome) ? 'prefeitura' : 'outro'
  const daCidade = new Set(normalize(municipio ?? '').split(/[^a-z0-9]+/))
  const palavras = new Set(nome.split(' ').filter((p) => p.length >= 4 && !PALAVRAS_GENERICAS_DO_ORGAO.has(p) && !daCidade.has(p)))
  return { tipo, palavras }
}

export function orgaosConflitam(a: string | null | undefined, b: string | null | undefined, municipio?: string | null): boolean {
  const ea = entidadeDoOrgao(a, municipio)
  const eb = entidadeDoOrgao(b, municipio)
  if (!ea || !eb) return false
  if (ea.tipo !== eb.tipo) return true
  if (ea.tipo !== 'outro') return false
  const menor = Math.min(ea.palavras.size, eb.palavras.size)
  if (menor === 0) return false
  let comuns = 0
  for (const palavra of ea.palavras) if (eb.palavras.has(palavra)) comuns++
  return comuns / menor < PALAVRAS_EM_COMUM_NO_MESMO_ORGAO
}

function modalidadeCompativel(aviso: AvisoDeOutraFonte, pncp: LicitacaoDoPncpComparavel): boolean {
  if (aviso.fonte === 'TCE_CE' && aviso.modalidade === 'OUTROS') return true
  return modalidadesEquivalentes(aviso.modalidade).includes(pncp.modalidade)
}

function numeroConsiderado(aviso: AvisoDeOutraFonte, pncp: LicitacaoDoPncpComparavel, numero: ComparacaoDoNumero): ComparacaoDoNumero {
  return numeracaoComparavel(aviso.modalidade, pncp.modalidade) ? numero : 'desconhecido'
}

export function conflitoComOPncp(aviso: AvisoDeOutraFonte, pncp: LicitacaoDoPncpComparavel, numero: ComparacaoDoNumero): ConflitoComOPncp | null {
  if (!modalidadeCompativel(aviso, pncp)) return 'modalidade'
  if (numeroConsiderado(aviso, pncp, numero) === 'diferente') return 'numero'
  if (comparacaoDoDia(aviso, pncp) === 'diferente') return 'dia'
  if (orgaosConflitam(aviso.orgao, pncp.orgao, aviso.municipio)) return 'orgao'
  return null
}

export function podeEsconderComoRepeticao(aviso: AvisoDeOutraFonte, pncp: LicitacaoDoPncpComparavel, numero: ComparacaoDoNumero): boolean {
  if (conflitoComOPncp(aviso, pncp, numero)) return false
  const similaridade = Number(pncp.similaridade)
  if (similaridade >= SIMILARIDADE_QUE_DISPENSA_CONFIRMACAO) return true
  if (similaridade < SIMILARIDADE_MINIMA_PARA_ESCONDER) return false
  return numeroConsiderado(aviso, pncp, numero) === 'igual' || comparacaoDoDia(aviso, pncp) === 'igual'
}
