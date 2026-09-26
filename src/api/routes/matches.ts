// ============================================================
// api/routes/matches.ts — Feed de matches (licitação x item monitorado)
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'

export const matchesRouter = Router()

const querySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { unreadOnly, page, pageSize } = querySchema.parse(req.query)

    const where = { userId: req.userId!, ...(unreadOnly ? { read: false } : {}) }

    const [items, total] = await Promise.all([
      prisma.tenderMatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { tender: true, monitoredItem: true },
      }),
      prisma.tenderMatch.count({ where }),
    ])

    res.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  })
)

// Apaga todos os matches do usuário de uma vez — útil pra "zerar" o feed
// e deixar só o que a coleta encontrar dali pra frente.
matchesRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.tenderMatch.deleteMany({ where: { userId: req.userId! } })
    res.json({ deleted: count })
  })
)

matchesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const match = await prisma.tenderMatch.findUnique({ where: { id: req.params.id } })
    if (!match) throw new ApiError(404, 'Match não encontrado')
    if (match.userId !== req.userId) throw new ApiError(403, 'Este match não pertence a você')

    const read = typeof req.body?.read === 'boolean' ? req.body.read : undefined
    if (read === undefined) throw new ApiError(400, 'Campo read (boolean) é obrigatório')

    const updated = await prisma.tenderMatch.update({ where: { id: req.params.id }, data: { read } })
    res.json(updated)
  })
)
