export function valorHomologadoConfirmado(valor: unknown, encerramentoAt: Date | null | undefined, agora: Date = new Date()): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = typeof valor === 'number' ? valor : Number.parseFloat(String(valor))
  if (!Number.isFinite(numero) || numero <= 0) return null
  if (encerramentoAt && encerramentoAt.getTime() > agora.getTime()) return null
  return numero
}
