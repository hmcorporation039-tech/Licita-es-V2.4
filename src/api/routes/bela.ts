import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { interpretarPedido } from '../../lib/bela/interpretar'

export const belaRouter = Router()

const pedidoSchema = z.object({
  texto: z.string().max(500),
  contexto: z.enum(['busca', 'pregao']).default('busca'),
})

belaRouter.post(
  '/interpretar',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { texto, contexto } = pedidoSchema.parse(req.body)
    res.json(interpretarPedido(texto, contexto))
  })
)
