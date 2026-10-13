import { Prisma, TenderAnalysis, AnalysisStatus } from '@prisma/client'
import { prisma } from './tenderService'
import type { AnaliseAnterior } from '../lib/esperaDeReanalise'

const STATUS_QUE_IMPEDEM_NOVA_RESERVA: AnalysisStatus[] = ['PENDING', 'RUNNING', 'DONE']

export async function reservarAnalise(tenderId: string, force: boolean): Promise<TenderAnalysis | null> {
  if (force) {
    return prisma.tenderAnalysis.upsert({
      where: { tenderId },
      update: { status: 'PENDING', errorMsg: null },
      create: { tenderId, status: 'PENDING' },
    })
  }

  try {
    return await prisma.tenderAnalysis.create({ data: { tenderId, status: 'PENDING' } })
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
  }

  const { count } = await prisma.tenderAnalysis.updateMany({
    where: { tenderId, status: { notIn: STATUS_QUE_IMPEDEM_NOVA_RESERVA } },
    data: { status: 'PENDING', errorMsg: null },
  })
  if (count === 0) return null
  return prisma.tenderAnalysis.findUnique({ where: { tenderId } })
}

export async function desfazerReserva(tenderId: string, anterior: AnaliseAnterior | null): Promise<void> {
  if (!anterior) {
    await prisma.tenderAnalysis.deleteMany({ where: { tenderId, status: 'PENDING' } })
    return
  }
  await prisma.tenderAnalysis.update({
    where: { tenderId },
    data: { status: anterior.status, errorMsg: anterior.errorMsg },
  })
}
