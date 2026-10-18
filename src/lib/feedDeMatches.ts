import { Prisma } from '@prisma/client'
import { whereLicitacaoAberta } from './licitacaoAberta'

export const PRAZO_MAX_DIAS_DO_FEED = Number(process.env.COLETA_PRAZO_MAX_DIAS ?? 30)

export const SITUACOES_INATIVAS = ['REVOGADA', 'SUSPENSA', 'ANULADA', 'CANCELADA'] as const

export interface RecorteDoFeed {
  incluirInativas?: boolean
  incluirForaDoPrazo?: boolean
}

export function whereDaLicitacaoNoFeed({ incluirInativas = false, incluirForaDoPrazo = false }: RecorteDoFeed = {}, agora: Date = new Date()): Prisma.TenderWhereInput {
  const recorte: Prisma.TenderWhereInput[] = []
  if (!incluirInativas) recorte.push({ situacao: { notIn: [...SITUACOES_INATIVAS] } })
  if (!incluirForaDoPrazo) {
    const limite = new Date(agora.getTime() + PRAZO_MAX_DIAS_DO_FEED * 24 * 60 * 60 * 1000)
    recorte.push({ publicadoAt: { not: null } })
    recorte.push({ OR: [{ encerramentoAt: null }, { prazoImprovavel: true }, { encerramentoAt: { gte: agora, lte: limite } }] })
  }
  return { AND: [whereLicitacaoAberta(agora), ...recorte] }
}
