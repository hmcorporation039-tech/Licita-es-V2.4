export function quantidadeCom(quantidade: number, singular: string, plural: string): string {
  return `${quantidade.toLocaleString('pt-BR')} ${Math.abs(quantidade) === 1 ? singular : plural}`
}

export function emDias(quantidade: number): string {
  return quantidadeCom(quantidade, 'dia', 'dias')
}

export function quandoVence(diasRestantes: number): string {
  if (diasRestantes <= 0) return 'vence hoje'
  if (diasRestantes === 1) return 'vence amanhã'
  return `vence em ${emDias(diasRestantes)}`
}
