// ============================================================
// api/routes/participationPlans.ts — Lista os planos de participação do
// usuário logado (ex: "Licitações escolhidas" = status VOU_PARTICIPAR).
// A leitura/escrita de UM plano específico continua em routes/tenders.ts
// (GET/PUT/PATCH /:id/plano) — esta rota é só pra listar vários de uma vez.
// ============================================================

import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler } from '../asyncHandler'
import { PARTICIPATION_STATUS_VALUES } from './tenders'
import { TENDER_PUBLICO } from '../../lib/tenderPublico'
import { exportacaoPlanilhaLimiter } from '../rateLimit'
import { gerarPlanilhaXlsx } from '../../lib/planilhaXlsx'
import {
  CAMPOS_DA_LICITACAO_NA_PLANILHA,
  COLUNAS_DAS_ESCOLHIDAS,
  TETO_DE_LINHAS_DA_PLANILHA,
  avisoDeListaCortada,
  linhaDaEscolhida,
} from '../../lib/planilhasDaEmpresa'
import { linkDaLicitacaoNoMonitor } from '../../services/emailService'
import { responderComPlanilha } from '../respostaDePlanilha'

export const participationPlansRouter = Router()

const ITENS_HOMOLOGADOS = { situacaoDoResultado: { equals: 'Homologado', mode: 'insensitive' } } satisfies Prisma.TenderItemWhereInput

const querySchema = z.object({
  status: z.enum(PARTICIPATION_STATUS_VALUES).optional(),
})

participationPlansRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = querySchema.parse(req.query)

    const plans = await prisma.tenderParticipationPlan.findMany({
      where: { companyId: req.companyId!, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { tender: { select: { ...TENDER_PUBLICO, _count: { select: { items: { where: ITENS_HOMOLOGADOS } } } } } },
    })

    res.json(plans.map(({ tender: { _count, ...tender }, ...plano }) => ({ ...plano, tender: { ...tender, itensHomologados: _count.items } })))
  })
)

participationPlansRouter.get(
  '/exportar',
  exportacaoPlanilhaLimiter,
  asyncHandler(async (req, res) => {
    const planos = await prisma.tenderParticipationPlan.findMany({
      where: { companyId: req.companyId! },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: TETO_DE_LINHAS_DA_PLANILHA + 1,
      select: { status: true, tender: { select: CAMPOS_DA_LICITACAO_NA_PLANILHA } },
    })
    const selecionados = planos.slice(0, TETO_DE_LINHAS_DA_PLANILHA)
    const linhas = selecionados.map((p) => linhaDaEscolhida(p.status, p.tender, linkDaLicitacaoNoMonitor(p.tender.id)))
    const planilha = gerarPlanilhaXlsx({
      nomeDaAba: 'Escolhidas',
      colunas: COLUNAS_DAS_ESCOLHIDAS,
      linhas,
      observacaoFinal: planos.length > selecionados.length ? avisoDeListaCortada(linhas.length, 'atualizadas mais recentemente') : undefined,
    })
    await responderComPlanilha(req, res, 'escolhidas', linhas.length, planilha)
  })
)
