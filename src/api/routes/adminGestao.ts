// ============================================================
// api/routes/adminGestao.ts — Painel do administrador da plataforma:
// visão geral, empresas (e o que cada uma tem), planos, trilha de auditoria
// e consumo de IA. Somente leitura sobre os dados dos clientes, EXCETO plano
// e ajuste de limite. Consultar os dados de uma empresa também é auditado
// (registro de acesso, exigência de LGPD).
// ============================================================

import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireAdmin, requireAuth } from '../authMiddleware'
import { escritaSensivelLimiter } from '../rateLimit'
import { registrarAuditoria, ACOES } from '../../services/auditService'
import { limitesDaEmpresa, resumoDeCotas } from '../../services/quotaService'
import { inicioDoMesBrasilia, lerLimites } from '../../lib/planos'

export const adminGestaoRouter = Router()
adminGestaoRouter.use(requireAuth, requireAdmin)

const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v))

// ---------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------
adminGestaoRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const mes = inicioDoMesBrasilia()
    const [empresas, usuarios, usuariosAtivos, licitacoes, itens, documentos, analises, usoMes, auditoria24h] =
      await Promise.all([
        prisma.company.count(),
        prisma.user.count(),
        prisma.user.count({ where: { active: true } }),
        prisma.tender.count(),
        prisma.monitoredItem.count(),
        prisma.companyDocument.count(),
        prisma.tenderAnalysis.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.aiUsage.aggregate({
          where: { createdAt: { gte: mes } },
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        }),
        prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      ])

    res.json({
      empresas,
      usuarios,
      usuariosAtivos,
      licitacoes,
      itensMonitorados: itens,
      documentosNoCofre: documentos,
      analises: Object.fromEntries(analises.map((a) => [a.status, a._count._all])),
      iaNoMes: {
        chamadas: usoMes._count._all,
        tokensEntrada: usoMes._sum.inputTokens ?? 0,
        tokensSaida: usoMes._sum.outputTokens ?? 0,
        custoEstimadoUsd: num(usoMes._sum.costUsd),
      },
      eventosDeAuditoriaUltimas24h: auditoria24h,
    })
  })
)

// ---------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------
const listCompaniesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

adminGestaoRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const { q, page, limit } = listCompaniesQuery.parse(req.query)
    const where: Prisma.CompanyWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { cnpj: { contains: q.replace(/\D/g, '') || q } },
            { email: { contains: q, mode: 'insensitive' } },
            { users: { some: { email: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}

    const [total, companies] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { users: true, monitoredItems: true, companyDocuments: true, participationPlans: true } } },
      }),
    ])

    const ids = companies.map((c) => c.id)
    const usoMes = await prisma.aiUsage.groupBy({
      by: ['companyId'],
      where: { companyId: { in: ids }, status: 'OK', createdAt: { gte: inicioDoMesBrasilia() } },
      _count: { _all: true },
    })
    const usoPorEmpresa = new Map(usoMes.map((u) => [u.companyId, u._count._all]))

    res.json({
      total,
      page,
      limit,
      empresas: companies.map((c) => ({
        id: c.id,
        nome: c.name,
        tipo: c.tipo,
        cnpj: c.cnpj,
        cpf: c.cpf,
        email: c.email,
        planCode: c.planCode,
        quotaOverrides: c.quotaOverrides,
        criadaEm: c.createdAt,
        usuarios: c._count.users,
        itensMonitorados: c._count.monitoredItems,
        documentos: c._count.companyDocuments,
        planosDeParticipacao: c._count.participationPlans,
        analisesIaNoMes: usoPorEmpresa.get(c.id) ?? 0,
      })),
    })
  })
)

adminGestaoRouter.get(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } })
    if (!company) throw new ApiError(404, 'Empresa não encontrada')

    const [users, items, documents, plans, cotas, auditoria, iaTotais, matches] = await Promise.all([
      prisma.user.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, email: true, name: true, companyRole: true, isAdmin: true, active: true,
          disabledByAdmin: true, accessExpiresAt: true, createdAt: true,
        },
      }),
      prisma.monitoredItem.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, active: true, ufs: true, keywords: true, catmatCodes: true, catserCodes: true, createdAt: true },
      }),
      // Só metadados: o cofre não guarda o arquivo, e o admin vê quais documentos existem e as validades.
      prisma.companyDocument.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, nome: true, tipo: true, dataEmissao: true, dataValidade: true, createdAt: true },
      }),
      prisma.tenderParticipationPlan.findMany({
        where: { companyId: company.id },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { tenderId: true, status: true, updatedAt: true, tender: { select: { objeto: true, orgao: true, aberturaAt: true } } },
      }),
      resumoDeCotas(company.id),
      prisma.auditLog.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.aiUsage.aggregate({
        where: { companyId: company.id },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      }),
      prisma.tenderMatch.count({ where: { companyId: company.id } }),
    ])

    await registrarAuditoria(req, {
      action: 'ADMIN_CONSULTOU_EMPRESA',
      entityType: 'empresa',
      entityId: company.id,
      companyId: company.id,
      metadata: { nome: company.name },
    })

    res.json({
      empresa: company,
      usuarios: users,
      itensMonitorados: items,
      documentos: documents,
      planosDeParticipacao: plans,
      matches,
      cotas,
      iaAcumulada: {
        chamadas: iaTotais._count._all,
        tokensEntrada: iaTotais._sum.inputTokens ?? 0,
        tokensSaida: iaTotais._sum.outputTokens ?? 0,
        custoEstimadoUsd: num(iaTotais._sum.costUsd),
      },
      auditoriaRecente: auditoria,
    })
  })
)

const limiteSchema = z.number().int().min(0).nullable()
const patchCompanySchema = z.object({
  planCode: z.string().min(1).max(40).optional(),
  // Ajuste combinado com o cliente; chave ausente = vale o plano; null (o objeto todo) = remove os ajustes.
  quotaOverrides: z
    .object({
      itensMonitorados: limiteSchema.optional(),
      usuarios: limiteSchema.optional(),
      analisesIaMes: limiteSchema.optional(),
    })
    .strict()
    .nullable()
    .optional(),
})

adminGestaoRouter.patch(
  '/companies/:id',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const body = patchCompanySchema.parse(req.body)
    const antes = await prisma.company.findUnique({ where: { id: req.params.id } })
    if (!antes) throw new ApiError(404, 'Empresa não encontrada')

    if (body.planCode && !(await prisma.subscriptionPlan.findUnique({ where: { code: body.planCode } }))) {
      throw new ApiError(400, `Plano "${body.planCode}" não existe`)
    }

    const data: Prisma.CompanyUpdateInput = {}
    if (body.planCode !== undefined) data.planCode = body.planCode
    if (body.quotaOverrides !== undefined) {
      data.quotaOverrides = body.quotaOverrides === null ? Prisma.DbNull : (body.quotaOverrides as Prisma.InputJsonValue)
    }

    const depois = await prisma.company.update({ where: { id: antes.id }, data })
    await registrarAuditoria(req, {
      action: 'PLANO_EMPRESA_ALTERADO',
      entityType: 'empresa',
      entityId: antes.id,
      companyId: antes.id,
      metadata: {
        planoAntes: antes.planCode,
        planoDepois: depois.planCode,
        ajustesAntes: antes.quotaOverrides as Prisma.InputJsonValue | null,
        ajustesDepois: depois.quotaOverrides as Prisma.InputJsonValue | null,
      } as Record<string, unknown>,
    })
    res.json({ id: depois.id, planCode: depois.planCode, quotaOverrides: depois.quotaOverrides, cotas: await limitesDaEmpresa(depois.id) })
  })
)

// ---------------------------------------------------------------
// Planos
// ---------------------------------------------------------------
adminGestaoRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } })
    const contagem = await prisma.company.groupBy({ by: ['planCode'], _count: { _all: true } })
    const porPlano = new Map(contagem.map((c) => [c.planCode, c._count._all]))
    res.json(plans.map((p) => ({ ...p, limits: lerLimites(p.limits), empresas: porPlano.get(p.code) ?? 0 })))
  })
)

const limitsSchema = z
  .object({
    itensMonitorados: limiteSchema,
    usuarios: limiteSchema,
    analisesIaMes: limiteSchema,
  })
  .strict()

const planBase = {
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  limits: limitsSchema,
  sortOrder: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  priceMonthlyCents: z.number().int().min(0).nullable().optional(),
  priceYearlyCents: z.number().int().min(0).nullable().optional(),
}

adminGestaoRouter.post(
  '/plans',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/), ...planBase }).parse(req.body)
    if (await prisma.subscriptionPlan.findUnique({ where: { code: body.code } })) {
      throw new ApiError(409, 'Já existe um plano com este código')
    }
    const plan = await prisma.subscriptionPlan.create({ data: { ...body, limits: body.limits as Prisma.InputJsonValue } })
    await registrarAuditoria(req, { action: 'PLANO_ALTERADO', entityType: 'plano', entityId: plan.code, metadata: { criado: true, limits: body.limits } })
    res.status(201).json(plan)
  })
)

adminGestaoRouter.put(
  '/plans/:code',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object(planBase).partial().parse(req.body)
    const antes = await prisma.subscriptionPlan.findUnique({ where: { code: req.params.code } })
    if (!antes) throw new ApiError(404, 'Plano não encontrado')

    const { limits, ...resto } = body
    const plan = await prisma.subscriptionPlan.update({
      where: { code: antes.code },
      data: { ...resto, ...(limits ? { limits: limits as Prisma.InputJsonValue } : {}) },
    })
    await registrarAuditoria(req, {
      action: 'PLANO_ALTERADO',
      entityType: 'plano',
      entityId: plan.code,
      metadata: { limitesAntes: antes.limits as Prisma.InputJsonValue, limitesDepois: plan.limits as Prisma.InputJsonValue, ativo: plan.active } as Record<string, unknown>,
    })
    res.json(plan)
  })
)

// ---------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------
const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.date().optional(), // paginação: eventos anteriores a este instante
  action: z.enum(ACOES).optional(),
  companyId: z.string().max(60).optional(),
  actor: z.string().trim().max(200).optional(), // parte do e-mail
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

function whereDaAuditoria(q: z.infer<typeof auditQuery>): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (q.before) createdAt.lt = q.before
  if (q.from) createdAt.gte = q.from
  if (q.to) createdAt.lte = q.to
  return {
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.actor ? { actorEmail: { contains: q.actor, mode: 'insensitive' } } : {}),
  }
}

adminGestaoRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = auditQuery.parse(req.query)
    const eventos = await prisma.auditLog.findMany({
      where: whereDaAuditoria(q),
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    })
    res.json({
      eventos,
      // Passe como ?before= para a próxima página.
      proximo: eventos.length === q.limit ? eventos[eventos.length - 1].createdAt : null,
    })
  })
)

// Planilhas interpretam =, +, - e @ no início da célula como fórmula.
function celulaCsv(valor: unknown): string {
  let s = valor == null ? '' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

adminGestaoRouter.get(
  '/audit/export',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const q = auditQuery.parse({ ...req.query, limit: 200 })
    const eventos = await prisma.auditLog.findMany({
      where: whereDaAuditoria(q),
      orderBy: { createdAt: 'desc' },
      take: 20_000,
    })
    await registrarAuditoria(req, {
      action: 'ADMIN_EXPORTOU_AUDITORIA',
      entityType: 'auditoria',
      metadata: { linhas: eventos.length, filtro: { action: q.action, companyId: q.companyId, actor: q.actor } },
    })

    const linhas = [
      ['data', 'ator', 'empresa', 'acao', 'entidade', 'entidade_id', 'ip', 'detalhes'].join(','),
      ...eventos.map((e) =>
        [e.createdAt.toISOString(), e.actorEmail, e.companyId, e.action, e.entityType, e.entityId, e.ip, e.metadata]
          .map(celulaCsv)
          .join(',')
      ),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send('﻿' + linhas.join('\r\n'))
  })
)

// ---------------------------------------------------------------
// Consumo de IA
// ---------------------------------------------------------------
const usageQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

adminGestaoRouter.get(
  '/ai-usage',
  asyncHandler(async (req, res) => {
    const { from, to } = usageQuery.parse(req.query)
    const createdAt: Prisma.DateTimeFilter = { gte: from ?? inicioDoMesBrasilia() }
    if (to) createdAt.lte = to
    const where: Prisma.AiUsageWhereInput = { createdAt }

    const [total, porEmpresa, porMes, recentes] = await Promise.all([
      prisma.aiUsage.aggregate({ where, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
      prisma.aiUsage.groupBy({
        by: ['companyId'],
        where,
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        orderBy: { _sum: { outputTokens: 'desc' } },
        take: 100,
      }),
      prisma.$queryRaw<{ mes: string; chamadas: bigint; entrada: bigint | null; saida: bigint | null; custo: Prisma.Decimal | null }[]>`
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
               count(*) AS chamadas, sum(input_tokens) AS entrada, sum(output_tokens) AS saida, sum(cost_usd) AS custo
        FROM ai_usage
        GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
      prisma.aiUsage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    ])

    const empresas = await prisma.company.findMany({
      where: { id: { in: porEmpresa.map((p) => p.companyId).filter((x): x is string => !!x) } },
      select: { id: true, name: true, planCode: true },
    })
    const nomes = new Map(empresas.map((e) => [e.id, e]))

    res.json({
      periodo: { de: createdAt.gte, ate: to ?? null },
      total: {
        chamadas: total._count._all,
        tokensEntrada: total._sum.inputTokens ?? 0,
        tokensSaida: total._sum.outputTokens ?? 0,
        custoEstimadoUsd: num(total._sum.costUsd),
      },
      porEmpresa: porEmpresa.map((p) => ({
        companyId: p.companyId,
        empresa: p.companyId ? (nomes.get(p.companyId)?.name ?? '(empresa removida)') : '(sem empresa — execução automática ou admin)',
        planCode: p.companyId ? (nomes.get(p.companyId)?.planCode ?? null) : null,
        chamadas: p._count._all,
        tokensEntrada: p._sum.inputTokens ?? 0,
        tokensSaida: p._sum.outputTokens ?? 0,
        custoEstimadoUsd: num(p._sum.costUsd),
      })),
      porMes: porMes.map((m) => ({
        mes: m.mes,
        chamadas: Number(m.chamadas),
        tokensEntrada: Number(m.entrada ?? 0),
        tokensSaida: Number(m.saida ?? 0),
        custoEstimadoUsd: num(m.custo),
      })),
      recentes,
      aviso: 'O custo em USD é uma estimativa e só aparece se AI_PRICE_INPUT_PER_MTOK e AI_PRICE_OUTPUT_PER_MTOK estiverem configurados.',
    })
  })
)

