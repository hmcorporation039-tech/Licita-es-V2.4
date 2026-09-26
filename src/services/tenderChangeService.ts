// ============================================================
// services/tenderChangeService.ts — Avisa quem acompanha uma licitação
// quando o órgão a republica com prazo, valor ou edital diferente.
// ============================================================

import { prisma } from './tenderService'
import { notificadorQueue } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { CAMPOS_RELEVANTES_PARA_AVISO, CampoMonitorado } from '../lib/tenderContentHash'

async function usuariosQueAcompanham(tenderId: string): Promise<string[]> {
  const [matches, planos] = await Promise.all([
    prisma.tenderMatch.findMany({ where: { tenderId }, select: { userId: true }, distinct: ['userId'] }),
    prisma.tenderParticipationPlan.findMany({
      where: { tenderId, status: { in: ['AVALIANDO', 'VOU_PARTICIPAR'] } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ])

  return Array.from(new Set([...matches, ...planos].map((r) => r.userId)))
}

// Enfileirar o aviso é efeito colateral da coleta: se o Redis estiver
// indisponível, a licitação já foi atualizada e isso não pode derrubar o job.
export async function avisarAlteracaoDeTender(
  tenderId: string,
  changedFields: CampoMonitorado[]
): Promise<number> {
  const relevantes = changedFields.filter((campo) => CAMPOS_RELEVANTES_PARA_AVISO.includes(campo))
  if (relevantes.length === 0) return 0

  try {
    const userIds = await usuariosQueAcompanham(tenderId)
    if (userIds.length === 0) return 0

    for (const userId of userIds) {
      await enfileirarSemTravar(
        notificadorQueue,
        'notify-tender-change',
        { tipo: 'alteracao', tenderId, userId, campos: relevantes },
        'TenderChange'
      )
    }

    return userIds.length
  } catch (err) {
    console.error('[TenderChange] Erro ao enfileirar aviso de alteração (licitação já atualizada):', err)
    return 0
  }
}
