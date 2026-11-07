// ============================================================
// api/routes/sessoes.ts — "Minhas sessões": os pregões que a empresa acompanha,
// com o chat do pregoeiro de cada um (não lidas e urgentes primeiro).
// ============================================================

import { Router } from 'express'
import { asyncHandler } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { minhasSessoes } from '../../services/mensagensDoPregao'

export const sessoesRouter = Router()

sessoesRouter.get(
  '/',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    res.json({ sessoes: await minhasSessoes(req.companyId!) })
  })
)
