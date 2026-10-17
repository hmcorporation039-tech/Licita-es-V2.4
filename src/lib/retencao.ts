import { Prisma } from '@prisma/client'
import { NormalizedTender } from '../types'

export function whereEncerradaParaRetencao(agora: Date): Prisma.TenderWhereInput {
  return { encerramentoAt: { lt: agora } }
}

export const WHERE_HOMOLOGADA_PARA_RETENCAO = {
  fonte: 'PNCP',
  valorHomologado: { not: null },
} satisfies Prisma.TenderWhereInput

export function retencaoApagariaAoChegar(
  tender: Pick<NormalizedTender, 'fonte' | 'encerramentoAt' | 'valorHomologado'>,
  agora: Date = new Date()
): boolean {
  if (tender.encerramentoAt && tender.encerramentoAt.getTime() < agora.getTime()) return true
  return tender.fonte === 'PNCP' && tender.valorHomologado !== undefined && tender.valorHomologado !== null
}
