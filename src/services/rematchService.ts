import type { MonitoredItem } from '@prisma/client'
import { prisma } from './tenderService'
import { findMatchingTendersForItem } from './matcherService'
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
  const candidates = await findMatchingTendersForItem(
    {
      keywords: item.keywords,
      palavrasDeExclusao: item.palavrasDeExclusao,
      catmatCodes: item.catmatCodes,
      catserCodes: item.catserCodes,
      ufs: item.ufs,
      modalidades: item.modalidades,
      orgaos: item.orgaos,
      uasgCodes: item.uasgCodes,
      valorMin: item.valorMin ? Number(item.valorMin) : null,
      valorMax: item.valorMax ? Number(item.valorMax) : null,
      raioKm: item.raioKm,
      origemLat: item.origemLat,
      origemLng: item.origemLng,
    },
    JANELA_DO_REMATCH_EM_DIAS
  )
  if (candidates.length === 0) return { matchesFound: 0 }

  const existing = await prisma.tenderMatch.findMany({
    where: { monitoredItemId: item.id },
    select: { tenderId: true },
  })
  const existingSet = new Set(existing.map((e) => e.tenderId))
  const newCandidates = candidates.filter((c) => !existingSet.has(c.tenderId))
  if (newCandidates.length === 0) return { matchesFound: 0 }

  const { count } = await prisma.tenderMatch.createMany({
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

  if (notificar) {
    const aNotificar = await prisma.tenderMatch.findMany({
      where: { monitoredItemId: item.id, tenderId: { in: newCandidates.slice(0, MAX_EMAILS_POR_REMATCH).map((c) => c.tenderId) } },
      select: { id: true },
    })
    for (const match of aNotificar) {
      await enfileirarSemTravar(notificadorQueue, 'notify-match', { tenderMatchId: match.id }, 'Rematch')
    }
  }

  return { matchesFound: count }
}
