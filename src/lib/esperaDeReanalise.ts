import type { AnalysisStatus } from '@prisma/client'

export const ESPERA_APOS_FALHA_MS = 60 * 60 * 1000
export const ESPERA_APOS_SEM_DOCUMENTOS_MS = 6 * 60 * 60 * 1000

export interface AnaliseAnterior {
  status: AnalysisStatus
  errorMsg: string | null
  updatedAt: Date
}

export function falhouHaPouco(analise: AnaliseAnterior, isAdmin: boolean, agora: Date = new Date()): boolean {
  if (isAdmin) return false
  const decorrido = agora.getTime() - analise.updatedAt.getTime()
  if (analise.status === 'FAILED') return decorrido < ESPERA_APOS_FALHA_MS
  if (analise.status === 'NO_DOCUMENTS') return decorrido < ESPERA_APOS_SEM_DOCUMENTOS_MS
  return false
}
