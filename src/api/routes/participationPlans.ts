// ============================================================
// api/routes/participationPlans.ts — Lista os planos de participação do
// usuário logado (ex: "Licitações escolhidas" = status VOU_PARTICIPAR).
// A leitura/escrita de UM plano específico continua em routes/tenders.ts
// (GET/PUT/PATCH /:id/plano) — esta rota é só pra listar vários de uma vez.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler } from '../asyncHandler'
import { PARTICIPATION_STATUS_VALUES } from './tenders'

export const participationPlansRouter = Router()

const querySchema = z.object({
  status: z.enum(PARTICIPATION_STATUS_VALUES).optional(),
})

participationPlansRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = querySchema.parse(req.query)

    const plans = await prisma.tenderParticipationPlan.findMany({
      where: { userId: req.userId!, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { tender: true },
    })

    res.json(plans)
  })
)
