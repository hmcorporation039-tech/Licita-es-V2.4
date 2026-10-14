const FUSO = 'America/Sao_Paulo'
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/
const MEIA_NOITE_UTC = /T00:00:00(\.0+)?(Z|\+00:00)$/

export type EntradaDeData = string | Date | null | undefined

export function ehDataPura(valor: EntradaDeData): boolean {
  if (!valor) return false
  if (typeof valor === 'string') return SO_DATA.test(valor) || MEIA_NOITE_UTC.test(valor)
  return valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0 && valor.getUTCMilliseconds() === 0
}

export function paraData(valor: EntradaDeData): Date | null {
  if (!valor) return null
  const data = typeof valor === 'string' && SO_DATA.test(valor) ? new Date(`${valor}T00:00:00Z`) : new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data
}

export function fimDoDiaEmBrasilia(valor: EntradaDeData): Date | null {
  const data = paraData(valor)
  if (!data) return null
  const dia = data.toISOString().slice(0, 10)
  return new Date(`${dia}T23:59:59-03:00`)
}

export function formatarData(valor: EntradaDeData, opcoes: { comHora?: boolean; anoCurto?: boolean } = {}): string {
  const data = paraData(valor)
  if (!data) return '—'
  const pura = ehDataPura(valor)
  const formato = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: opcoes.anoCurto ? '2-digit' : 'numeric',
    ...(opcoes.comHora && !pura ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: pura ? 'UTC' : FUSO,
  })
  return formato.format(data).replace(',', '')
}
