const TEM_FUSO = /(?:[zZ]|[+-]\d{2}:?\d{2})$/
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/

export const DESLOCAMENTO_DE_BRASILIA_MS = 3 * 60 * 60 * 1000

export function dataDeBrasilia(valor: string | null | undefined): Date | undefined {
  const texto = (valor ?? '').trim()
  if (!texto) return undefined
  const comFuso = TEM_FUSO.test(texto) ? texto : SO_DATA.test(texto) ? `${texto}T00:00:00-03:00` : `${texto.replace(' ', 'T')}-03:00`
  const data = new Date(comFuso)
  return Number.isNaN(data.getTime()) ? undefined : data
}

export function horaDeBrasilia(ano: number, mesBaseZero: number, dia: number, hora = 0, minuto = 0): Date {
  return new Date(Date.UTC(ano, mesBaseZero, dia, hora, minuto) + DESLOCAMENTO_DE_BRASILIA_MS)
}

export function diaDeBrasilia(d: Date): string {
  return new Date(d.getTime() - DESLOCAMENTO_DE_BRASILIA_MS).toISOString().slice(0, 10)
}

export function inicioDoDiaEmBrasilia(d: Date): Date {
  const local = new Date(d.getTime() - DESLOCAMENTO_DE_BRASILIA_MS)
  return horaDeBrasilia(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
}

const FUSO_DE_BRASILIA = 'America/Sao_Paulo'
const DIA_MS = 24 * 60 * 60 * 1000
const FONTES_SEMPRE_COM_HORA = new Set(['PNCP'])

const FORMATO_DIA_DE_BRASILIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO_DE_BRASILIA })
const FORMATO_DIA_E_HORA_DE_BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FUSO_DE_BRASILIA,
})
const FORMATO_DIA_DO_CALENDARIO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

export function ehDiaSemHoraDaLicitacao(data: Date, fonte: string): boolean {
  if (FONTES_SEMPRE_COM_HORA.has(fonte)) return false
  const relogioLocal = data.getTime() - DESLOCAMENTO_DE_BRASILIA_MS
  return ((relogioLocal % DIA_MS) + DIA_MS) % DIA_MS === 0
}

export function fimDoPrazoDaLicitacao(data: Date, fonte: string): Date {
  return ehDiaSemHoraDaLicitacao(data, fonte) ? new Date(data.getTime() + DIA_MS - 1000) : data
}

export function formatarDiaEHoraDeBrasilia(data: Date): string {
  return FORMATO_DIA_E_HORA_DE_BRASILIA.format(data).replace(',', '')
}

export function formatarPrazoDaLicitacao(data: Date, fonte: string): string {
  return ehDiaSemHoraDaLicitacao(data, fonte) ? FORMATO_DIA_DE_BRASILIA.format(data) : formatarDiaEHoraDeBrasilia(data)
}

export function formatarDiaDoCalendario(data: Date): string {
  return FORMATO_DIA_DO_CALENDARIO.format(data)
}
