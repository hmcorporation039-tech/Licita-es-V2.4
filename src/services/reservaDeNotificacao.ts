import { Prisma, type NotificationTypeEnum } from '@prisma/client'
import { prisma } from './tenderService'

export const RESERVA_ABANDONADA_APOS_MS = 15 * 60 * 1000

export interface NotificacaoParaReservar {
  id: string
  userId: string
  title: string
  body: string
  metadata: Prisma.InputJsonObject
  type?: NotificationTypeEnum
}

function ehChaveRepetida(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

async function criarReserva(dados: NotificacaoParaReservar, agora: Date): Promise<boolean> {
  try {
    await prisma.notification.create({ data: { type: 'EMAIL', ...dados, sentAt: null, createdAt: agora } })
    return true
  } catch (err) {
    if (ehChaveRepetida(err)) return false
    throw err
  }
}

export async function reservarNotificacao(dados: NotificacaoParaReservar, agora: Date = new Date()): Promise<boolean> {
  if (await criarReserva(dados, agora)) return true
  const { count } = await prisma.notification.deleteMany({
    where: { id: dados.id, sentAt: null, createdAt: { lt: new Date(agora.getTime() - RESERVA_ABANDONADA_APOS_MS) } },
  })
  return count > 0 && (await criarReserva(dados, agora))
}

export async function confirmarEnvio(ids: string[], agora: Date = new Date()): Promise<void> {
  await prisma.notification.updateMany({ where: { id: { in: ids }, sentAt: null }, data: { sentAt: agora } })
}

export async function desfazerReservas(ids: string[]): Promise<void> {
  await prisma.notification.deleteMany({ where: { id: { in: ids }, sentAt: null } })
}
