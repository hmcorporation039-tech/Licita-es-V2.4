export const MAX_MATCHES_POR_ITEM = 2_000

export interface CandidatoComAderencia {
  tenderId: string
  score: number
  encerramentoAt: Date | null
}

function prazoParaOrdenar(encerramentoAt: Date | null): number {
  return encerramentoAt ? encerramentoAt.getTime() : Number.POSITIVE_INFINITY
}

export function compararPorAderenciaEPrazo(a: CandidatoComAderencia, b: CandidatoComAderencia): number {
  if (a.score !== b.score) return b.score - a.score
  const prazoA = prazoParaOrdenar(a.encerramentoAt)
  const prazoB = prazoParaOrdenar(b.encerramentoAt)
  if (prazoA !== prazoB) return prazoA < prazoB ? -1 : 1
  if (a.tenderId === b.tenderId) return 0
  return a.tenderId < b.tenderId ? -1 : 1
}

export interface SelecaoDentroDoLimite<T> {
  selecionados: T[]
  limitado: boolean
}

export function selecionarDentroDoLimite<T extends CandidatoComAderencia>(
  novos: T[],
  abertosJaGravados: number,
  limite: number = MAX_MATCHES_POR_ITEM
): SelecaoDentroDoLimite<T> {
  const vagas = Math.max(0, limite - abertosJaGravados)
  const ordenados = [...novos].sort(compararPorAderenciaEPrazo)
  return { selecionados: ordenados.slice(0, vagas), limitado: abertosJaGravados + novos.length > limite }
}

export function avisoDoLimite(limite: number = MAX_MATCHES_POR_ITEM): string {
  return `Palavra muito genérica: mostrando as ${limite.toLocaleString('pt-BR')} mais aderentes — refine com estados, valor ou palavras de exclusão.`
}
