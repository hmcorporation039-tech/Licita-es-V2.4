// ============================================================
// api/routes/public.ts — Dados públicos (sem login) para a página inicial:
// os planos ativos e o que cada um inclui. Preço só aparece quando definido.
// ============================================================

import { Router } from 'express'
import { prisma } from '../../services/tenderService'
import { asyncHandler } from '../asyncHandler'
import { lerLimites } from '../../lib/planos'
import { trialDias } from '../../services/contaService'
import { TERMOS_VERSAO } from '../../lib/legal'

export const publicRouter = Router()

publicRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json({
      trialDias: trialDias(),
      termosVersao: TERMOS_VERSAO,
      planos: plans.map((p) => ({
        codigo: p.code,
        nome: p.name,
        descricao: p.description,
        limites: lerLimites(p.limits),
        precoMensalCentavos: p.priceMonthlyCents,
        precoAnualCentavos: p.priceYearlyCents,
      })),
    })
  })
)
