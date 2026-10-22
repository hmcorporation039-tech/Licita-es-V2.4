import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../asyncHandler'
import { PORTAIS } from '../../lib/portais'
import { listarCredenciais, removerCredencial, salvarCredencial } from '../../services/meusPortais'
import { registrarAuditoria } from '../../services/auditService'

export const meusPortaisRouter = Router()

const salvarSchema = z.object({
  portal: z.string().min(1).max(40),
  login: z.string().min(1).max(200),
  senha: z.string().min(1).max(400),
  aceiteDoTermo: z.literal(true),
  consentimentoTexto: z.string().min(1).max(2000),
})

meusPortaisRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ portais: PORTAIS, credenciais: await listarCredenciais(req.companyId!) })
  })
)

meusPortaisRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { portal, login, senha, consentimentoTexto } = salvarSchema.parse(req.body)
    const salvo = await salvarCredencial(req.companyId!, { portal, login, senha, consentimentoTexto })
    await registrarAuditoria(req, { action: 'PORTAL_CREDENCIAL_SALVA', entityType: 'portal', entityId: salvo.id, metadata: { portal } })
    res.status(201).json(salvo)
  })
)

meusPortaisRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await removerCredencial(req.companyId!, req.params.id)
    await registrarAuditoria(req, { action: 'PORTAL_CREDENCIAL_REMOVIDA', entityType: 'portal', entityId: req.params.id })
    res.status(204).end()
  })
)
