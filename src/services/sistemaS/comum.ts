import { ModalidadeEnum } from '../../types'
import { SescUnidade, detectarModalidade } from '../sescRegional/tipos'

const HORAS_DE_BRASILIA_PARA_UTC = 3
const DIA_MS = 86_400_000

export type EntidadeDoSistemaS = 'SESI' | 'SENAI' | 'IEL' | 'SENAC' | 'FEDERACAO' | 'SISTEMA'

export interface FonteHtmlDoSistemaS {
  origem: string
  unidade: SescUnidade
  contar: (html: string) => number
}

export function horarioDeBrasilia(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date | undefined {
  if (![ano, mes, dia, hora, minuto].every(Number.isInteger)) return undefined
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return undefined
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora + HORAS_DE_BRASILIA_PARA_UTC, minuto))
  const conferida = new Date(data.getTime() - HORAS_DE_BRASILIA_PARA_UTC * 3_600_000)
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return undefined
  return data
}

export function relogioLocalComoBrasilia(texto: string | null | undefined): Date | undefined {
  const m = (texto ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]00:?00)?$/)
  if (!m) return undefined
  const [, ano, mes, dia, hora, minuto] = m
  return horarioDeBrasilia(Number(ano), Number(mes), Number(dia), Number(hora ?? 0), Number(minuto ?? 0))
}

export function dataDoPortal(texto: string | null | undefined): Date | undefined {
  const valor = (texto ?? '').trim()
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  if (br) return horarioDeBrasilia(Number(br[3]), Number(br[2]), Number(br[1]), Number(br[4] ?? 0), Number(br[5] ?? 0))
  return relogioLocalComoBrasilia(valor)
}

export function inicioDoDiaEmBrasilia(agora: Date): Date {
  const local = new Date(agora.getTime() - HORAS_DE_BRASILIA_PARA_UTC * 3_600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), HORAS_DE_BRASILIA_PARA_UTC))
}

export function aberturaAindaPorVir(abertura: Date | undefined, agora: Date): boolean {
  return abertura !== undefined && abertura.getTime() >= inicioDoDiaEmBrasilia(agora).getTime()
}

export function diasAntes(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * DIA_MS)
}

export function urlHttp(valor: string | null | undefined): string | undefined {
  const texto = (valor ?? '').trim()
  if (!/^https?:\/\//i.test(texto)) return undefined
  try {
    const url = new URL(texto)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function modalidadeDoSistemaS(texto: string, situacao = ''): ModalidadeEnum {
  const t = semAcento(texto)
  if (/pregao/.test(t)) return detectarModalidade(texto)
  if (/sem disputa/.test(t)) return 'DISPENSA_SEM_DISPUTA'
  if (/compra direta|dispensa/.test(t)) return /lance/.test(semAcento(situacao)) ? 'DISPENSA_COM_DISPUTA' : 'DISPENSA_SEM_DISPUTA'
  if (/credenciamento/.test(t)) return 'CREDENCIAMENTO'
  if (/concurso/.test(t)) return 'CONCURSO'
  if (/concorrencia/.test(t)) return 'CONCORRENCIA'
  if (/convite/.test(t)) return 'CONVITE'
  if (/inexigibilidade/.test(t)) return 'INEXIGIBILIDADE'
  return 'OUTROS'
}

const PADROES_DE_ENTIDADE: [EntidadeDoSistemaS, RegExp][] = [
  ['SESI', /\bsesi\b|servico social da industria/],
  ['SENAI', /\bsenai\b|aprendizagem industrial|\bisi\b|\bist\b|cimatec/],
  ['IEL', /\biel\b|euvaldo lodi/],
  ['SENAC', /\bsenac\b|aprendizagem comercial/],
]

export function entidadesDoNome(nome: string, siglaDaFederacao?: string): EntidadeDoSistemaS[] {
  const t = semAcento(nome).replace(/[^a-z0-9]+/g, ' ')
  const entidades = PADROES_DE_ENTIDADE.filter(([, padrao]) => padrao.test(t)).map(([entidade]) => entidade)
  if (entidades.length > 0) return entidades
  const sigla = siglaDaFederacao ? semAcento(siglaDaFederacao) : undefined
  if (/\bsistema industria\b/.test(t) || (sigla !== undefined && new RegExp(`\\bsistema s?${sigla}\\b`).test(t))) return ['SISTEMA']
  const ehFederacao =
    /\bfederacao das ind/.test(t) ||
    (sigla !== undefined && new RegExp(`\\bs?${sigla}\\b`).test(t)) ||
    (sigla === 'cni' && /\bconfederacao nacional da industria\b/.test(t))
  return ehFederacao ? ['FEDERACAO'] : []
}

export function orgaoDasEntidades(entidades: EntidadeDoSistemaS[], sufixo: string, siglaDaFederacao: string): string | undefined {
  const doSistemaS = (['SESI', 'SENAI', 'IEL', 'SENAC'] as const).filter((e) => entidades.includes(e))
  if (doSistemaS.length > 0) return `${doSistemaS.join('/')}-${sufixo}`
  if (entidades.includes('SISTEMA')) return siglaDaFederacao === 'CNI' ? 'Sistema Indústria' : `Sistema ${siglaDaFederacao}`
  if (entidades.includes('FEDERACAO')) return siglaDaFederacao
  return undefined
}
