import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../asyncHandler'
import { registrarAuditoria } from '../../services/auditService'

export const interesseRouter = Router()

const registrarSchema = z.object({
  fonte: z.string().trim().min(1).max(40),
  observacao: z.string().trim().max(500).optional(),
})

interesseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fonte, observacao } = registrarSchema.parse(req.body)
    await registrarAuditoria(req, { action: 'INTERESSE_DE_FONTE', entityType: 'fonte', entityId: fonte, metadata: { fonte, observacao } })
    res.status(201).json({ registrado: true })
  })
)
