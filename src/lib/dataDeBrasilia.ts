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

export function inicioDoDiaEmBrasilia(d: Date): Date {
  const local = new Date(d.getTime() - DESLOCAMENTO_DE_BRASILIA_MS)
  return horaDeBrasilia(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
}
