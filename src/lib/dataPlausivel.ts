export const PRIMEIRA_DATA_PLAUSIVEL = new Date(Date.UTC(2000, 0, 1))
export const ANOS_PLAUSIVEIS_NO_FUTURO = 11

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
