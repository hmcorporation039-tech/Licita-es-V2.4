// ============================================================
// routes/escritorio.ts — API do "Escritório da Bela" (admin global).
// Só leitura: devolve o estado real dos 6 agentes. Não há rota de decisão —
// o pregão é sugestão e a confirmação é do cliente, no painel dele (ver o
// serviço). Atrás de requireAuth + requireAdmin, como o resto da administração.
// ============================================================

import { Router } from 'express'
import { asyncHandler } from '../asyncHandler'
import { requireAuth, requireAdmin } from '../authMiddleware'
import { statusDoEscritorio } from '../../services/escritorio'

export const escritorioRouter = Router()

escritorioRouter.use(requireAuth, requireAdmin)

escritorioRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ agentes: await statusDoEscritorio() })
  })
)
