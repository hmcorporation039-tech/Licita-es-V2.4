const DIA_MS = 24 * 60 * 60 * 1000

export const MARCOS_DE_VENCIMENTO = [5, 15, 30] as const
export const MARCO_VENCIDO = 0

export function marcoDoVencimento(diasRestantes: number): number | null {
  if (diasRestantes < 0) return MARCO_VENCIDO
  for (const marco of MARCOS_DE_VENCIMENTO) {
    if (diasRestantes <= marco) return marco
  }
  return null
}

export function deveAlertarVencimento(diasRestantes: number, ultimoAlerta: Date | null, agora: Date): boolean {
  const marcoAgora = marcoDoVencimento(diasRestantes)
  if (marcoAgora === null) return false
  if (!ultimoAlerta) return true
  const diasDesdeOUltimo = Math.floor((agora.getTime() - ultimoAlerta.getTime()) / DIA_MS)
  const marcoNoUltimoAlerta = marcoDoVencimento(diasRestantes + diasDesdeOUltimo)
  if (marcoNoUltimoAlerta === null) return true
  return marcoAgora < marcoNoUltimoAlerta
}
