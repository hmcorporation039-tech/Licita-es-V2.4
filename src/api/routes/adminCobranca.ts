import { Router, type Request } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { exigirConfirmacaoRecente, requireAdmin, requireAuth } from '../authMiddleware'
import { escritaSensivelLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { cancelarPeloAdministrador, painelDaCobranca, reembolsarPrimeiroPagamento, sincronizarAssinatura } from '../../services/cobranca'
import { CODIGO_DE_CUPOM, fimDoDiaEmBrasilia, normalizarCodigoDoCupom } from '../../lib/cobranca'

export const adminCobrancaRouter = Router()
adminCobrancaRouter.use(['/cobranca', '/cupons'], requireAuth, requireAdmin)

const novoCupomSchema = z.object({
  codigo: z
    .string()
    .transform(normalizarCodigoDoCupom)
    .refine((c) => CODIGO_DE_CUPOM.test(c), 'Use de 3 a 30 letras, números ou hífen'),
  percentual: z.number().int().min(1).max(90),
  meses: z.number().int().min(1).max(36),
  maxUsos: z.number().int().min(1).max(10_000).nullable().optional(),
  validoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
})

const cupomAlteradoSchema = z.object({
  ativo: z.boolean().optional(),
  maxUsos: z.number().int().min(1).max(10_000).nullable().optional(),
  validoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
})

function idDoParametro(req: Request): string {
  const id = (req.params as { id?: string }).id ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'Não encontrado')
  return id
}

adminCobrancaRouter.get(
  '/cobranca',
  asyncHandler(async (_req, res) => {
    res.json(await painelDaCobranca())
  })
)

adminCobrancaRouter.post(
  '/cobranca/assinaturas/:id/sincronizar',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    res.json({ cobrancas: await sincronizarAssinatura(idDoParametro(req)) })
  })
)

adminCobrancaRouter.post(
  '/cobranca/assinaturas/:id/reembolsar',
  escritaSensivelLimiter,
  exigirConfirmacaoRecente,
  asyncHandler(async (req, res) => {
    await reembolsarPrimeiroPagamento(idDoParametro(req), req.userId!)
    res.json({ ok: true })
  })
)

adminCobrancaRouter.post(
  '/cobranca/assinaturas/:id/cancelar',
  escritaSensivelLimiter,
  exigirConfirmacaoRecente,
  asyncHandler(async (req, res) => {
    await cancelarPeloAdministrador(idDoParametro(req), req.userId!)
    res.json({ ok: true })
  })
)

adminCobrancaRouter.post(
  '/cupons',
  exigirConfirmacaoRecente,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const d = novoCupomSchema.parse(req.body)
    try {
      const cupom = await prisma.cupom.create({
        data: {
          codigo: d.codigo,
          percentual: d.percentual,
          meses: d.meses,
          maxUsos: d.maxUsos ?? null,
          validoAte: d.validoAte ? fimDoDiaEmBrasilia(d.validoAte) : null,
          observacao: d.observacao || null,
        },
      })
      await registrarAuditoria(req, { action: 'CUPOM_CRIADO', entityType: 'cupom', entityId: cupom.id, companyId: null, metadata: { codigo: cupom.codigo, percentual: cupom.percentual, meses: cupom.meses } })
      res.status(201).json(cupom)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(409, 'Já existe um cupom com este código')
      throw err
    }
  })
)

adminCobrancaRouter.patch(
  '/cupons/:id',
  exigirConfirmacaoRecente,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const id = idDoParametro(req)
    const d = cupomAlteradoSchema.parse(req.body)
    const existe = await prisma.cupom.findUnique({ where: { id }, select: { id: true } })
    if (!existe) throw new ApiError(404, 'Cupom não encontrado')
    const cupom = await prisma.cupom.update({
      where: { id },
      data: {
        ...(d.ativo !== undefined ? { ativo: d.ativo } : {}),
        ...(d.maxUsos !== undefined ? { maxUsos: d.maxUsos } : {}),
        ...(d.validoAte !== undefined ? { validoAte: d.validoAte ? fimDoDiaEmBrasilia(d.validoAte) : null } : {}),
        ...(d.observacao !== undefined ? { observacao: d.observacao || null } : {}),
      },
    })
    await registrarAuditoria(req, { action: 'CUPOM_ALTERADO', entityType: 'cupom', entityId: id, companyId: null, metadata: d as Record<string, unknown> })
    res.json(cupom)
  })
)
