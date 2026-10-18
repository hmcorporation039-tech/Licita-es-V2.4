import { ModalidadeEnum } from '../types'

export const PRIMEIRA_DATA_PLAUSIVEL = new Date(Date.UTC(2000, 0, 1))
export const ANOS_PLAUSIVEIS_NO_FUTURO = 11
export const DIAS_MAXIMOS_DO_PRAZO_COMPETITIVO = 366

const DIA_MS = 86_400_000

export const MODALIDADES_COMPETITIVAS: readonly ModalidadeEnum[] = [
  'PREGAO_ELETRONICO',
  'PREGAO_PRESENCIAL',
  'CONCORRENCIA',
  'DISPENSA_COM_DISPUTA',
  'DISPENSA_SEM_DISPUTA',
  'CONVITE',
  'TOMADA_DE_PRECOS',
  'CONCURSO',
  'DIALOGO_COMPETITIVO',
]

export interface DatasDoPrazo {
  modalidade?: ModalidadeEnum | null
  encerramentoAt: Date | null
  aberturaAt: Date | null
  publicadoAt: Date | null
  createdAt: Date
}

export function limiteDeDataPlausivel(agora: Date = new Date()): Date {
  const limite = new Date(agora.getTime())
  limite.setUTCFullYear(limite.getUTCFullYear() + ANOS_PLAUSIVEIS_NO_FUTURO)
  return limite
}

export function ehDataPlausivel(data: Date, agora: Date = new Date()): boolean {
  const instante = data.getTime()
  return !Number.isNaN(instante) && instante >= PRIMEIRA_DATA_PLAUSIVEL.getTime() && instante <= limiteDeDataPlausivel(agora).getTime()
}

export function dataPlausivel(data: Date | null | undefined, agora: Date = new Date()): Date | undefined {
  return data && ehDataPlausivel(data, agora) ? data : undefined
}

export function dataAlemDoLimite(data: Date | null | undefined, agora: Date = new Date()): boolean {
  return !!data && data.getTime() > limiteDeDataPlausivel(agora).getTime()
}

export function ehModalidadeCompetitiva(modalidade: ModalidadeEnum | null | undefined): boolean {
  return !!modalidade && MODALIDADES_COMPETITIVAS.includes(modalidade)
}

function inicioDoProcesso(t: DatasDoPrazo): Date {
  const datas = [t.publicadoAt, t.aberturaAt].filter((d): d is Date => d instanceof Date)
  return datas.length > 0 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : t.createdAt
}

export function prazoImprovavel(t: DatasDoPrazo): boolean {
  if (!t.encerramentoAt || !ehModalidadeCompetitiva(t.modalidade)) return false
  return t.encerramentoAt.getTime() > inicioDoProcesso(t).getTime() + DIAS_MAXIMOS_DO_PRAZO_COMPETITIVO * DIA_MS
}
