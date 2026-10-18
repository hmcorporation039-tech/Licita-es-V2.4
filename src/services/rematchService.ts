import type { MonitoredItem } from '@prisma/client'
import { prisma } from './tenderService'
import { entradaDoItem, findMatchingTendersForItem, reavaliarMatchesDoItem, type ResultadoDaReavaliacao } from './matcherService'
import { notificadorQueue } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'

export const MAX_EMAILS_POR_REMATCH = 20
const JANELA_DO_REMATCH_EM_DIAS = 90

type ItemParaRematch = Pick<
  MonitoredItem,
  | 'id'
  | 'companyId'
  | 'userId'
  | 'keywords'
  | 'palavrasDeExclusao'
  | 'catmatCodes'
  | 'catserCodes'
  | 'ufs'
  | 'modalidades'
  | 'orgaos'
  | 'uasgCodes'
  | 'valorMin'
  | 'valorMax'
  | 'raioKm'
  | 'origemLat'
  | 'origemLng'
>

export async function buscarLicitacoesDoItem(item: ItemParaRematch, { notificar }: { notificar: boolean }): Promise<{ matchesFound: number }> {
  const candidates = await findMatchingTendersForItem(entradaDoItem(item), JANELA_DO_REMATCH_EM_DIAS)
  if (candidates.length === 0) return { matchesFound: 0 }

  const existing = await prisma.tenderMatch.findMany({
    where: { monitoredItemId: item.id, tenderId: { in: candidates.map((c) => c.tenderId) } },
    select: { tenderId: true },
  })
  const existingSet = new Set(existing.map((e) => e.tenderId))
  const newCandidates = candidates.filter((c) => !existingSet.has(c.tenderId))
  if (newCandidates.length === 0) return { matchesFound: 0 }

  await prisma.tenderMatch.createMany({
    data: newCandidates.map((c) => ({
      tenderId: c.tenderId,
      monitoredItemId: item.id,
      companyId: item.companyId,
      userId: item.userId,
      score: c.score,
      matchedByCode: c.matchedByCode,
      matchedKeywords: c.matchedKeywords,
      dentroDeObraCompleta: c.dentroDeObraCompleta,
    })),
    skipDuplicates: true,
  })

  const created = await prisma.tenderMatch.findMany({
    where: { monitoredItemId: item.id, tenderId: { in: newCandidates.map((c) => c.tenderId) } },
    select: { id: true },
  })

  if (notificar) {
    for (const match of created.slice(0, MAX_EMAILS_POR_REMATCH)) {
      await enfileirarSemTravar(notificadorQueue, 'notify-match', { tenderMatchId: match.id }, 'Rematch')
    }
  }

  return { matchesFound: created.length }
}

export async function reavaliarEBuscarLicitacoesDoItem(
  item: ItemParaRematch & { active: boolean }
): Promise<ResultadoDaReavaliacao & { matchesFound: number }> {
  const reavaliacao = await reavaliarMatchesDoItem({ ...entradaDoItem(item), id: item.id, companyId: item.companyId })
  const { matchesFound } = item.active ? await buscarLicitacoesDoItem(item, { notificar: false }) : { matchesFound: 0 }
  return { ...reavaliacao, matchesFound }
}
