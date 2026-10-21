import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireCompanyOwner } from '../authMiddleware'
import { escritaSensivelLimiter } from '../rateLimit'
import { CICLOS, tokenConfere } from '../../lib/cobranca'
import { assinar, cancelarAssinaturaDaEmpresa, cobrancaDisponivel, planosParaAssinar, processarEventoDoAsaas, resumoDaCobranca } from '../../services/cobranca'

export const assinaturaSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  ciclo: z.enum(CICLOS),
  cupom: z.string().trim().max(30).optional().nullable(),
})

export const webhookDoAsaasRouter = Router()

webhookDoAsaasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN
    if (!esperado) {
      console.error('[Cobrança] Aviso do Asaas recusado: ASAAS_WEBHOOK_TOKEN não está configurado.')
      throw new ApiError(503, 'Webhook não configurado')
    }
    if (!tokenConfere(req.header('asaas-access-token'), esperado)) throw new ApiError(401, 'Token inválido')
    const resultado = await processarEventoDoAsaas(req.body)
    res.json({ recebido: true, resultado })
  })
)

export const cobrancaPublicaRouter = Router()

cobrancaPublicaRouter.get(
  '/planos',
  asyncHandler(async (_req, res) => {
    res.json({ disponivel: cobrancaDisponivel(), planos: cobrancaDisponivel() ? await planosParaAssinar() : [] })
  })
)

export const cobrancaRouter = Router()

cobrancaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ ...(await resumoDaCobranca(req.companyId!)), podeGerenciar: req.companyRole === 'OWNER' })
  })
)

cobrancaRouter.post(
  '/assinar',
  requireCompanyOwner,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const pedido = assinaturaSchema.parse(req.body)
    res.status(201).json(await assinar({ ...pedido, companyId: req.companyId!, userId: req.userId! }))
  })
)

cobrancaRouter.post(
  '/cancelar',
  requireCompanyOwner,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    res.json(await cancelarAssinaturaDaEmpresa(req.companyId!, req.userId!))
  })
)
