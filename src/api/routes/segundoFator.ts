import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { agoraEmSegundos, signSessionToken, verifyPasswordConstantTime } from '../../services/authService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { segundoFatorLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import {
  ativarAplicativo,
  conferirSegundoFator,
  prepararAplicativo,
  renovarCodigosDeRecuperacao,
  situacaoDoSegundoFator,
  usuarioParaConferir,
} from '../../services/segundoFator'

export const segundoFatorRouter = Router()

const codigoSchema = z.object({ codigo: z.string().trim().min(6).max(20) })

const aplicativoSchema = z.object({
  senha: z.string().min(1).max(200),
  codigoAtual: z.string().trim().min(6).max(20).optional(),
})

async function exigirCodigoValido(userId: string, codigo: string): Promise<void> {
  const conferencia = await conferirSegundoFator(await usuarioParaConferir(userId), codigo)
  if (!conferencia.ok) {
    throw new ApiError(400, 'Código incorreto. Digite o código que está aparecendo agora no aplicativo, ou um código de recuperação.', { code: 'SEGUNDO_FATOR_INCORRETO' })
  }
}

segundoFatorRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await situacaoDoSegundoFator(req.userId!))
  })
)

segundoFatorRouter.post(
  '/aplicativo',
  segundoFatorLimiter,
  asyncHandler(async (req, res) => {
    if (!req.isAdmin) throw new ApiError(403, 'O login em duas etapas está disponível só para administradores por enquanto.')
    const { senha, codigoAtual } = aplicativoSchema.parse(req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { email: true, passwordHash: true } })
    if (!(await verifyPasswordConstantTime(senha, user.passwordHash))) throw new ApiError(400, 'Senha incorreta.', { code: 'SENHA_INCORRETA' })
    if (req.segundoFatorAtivo) {
      if (!codigoAtual) throw new ApiError(400, 'Para trocar de aparelho, digite também um código do aparelho atual ou um código de recuperação.', { code: 'SEGUNDO_FATOR_ATUAL' })
      await exigirCodigoValido(req.userId!, codigoAtual)
    }
    res.json(await prepararAplicativo(req.userId!, user.email))
  })
)

segundoFatorRouter.post(
  '/ativar',
  segundoFatorLimiter,
  asyncHandler(async (req, res) => {
    if (!req.isAdmin) throw new ApiError(403, 'O login em duas etapas está disponível só para administradores por enquanto.')
    const { codigo } = codigoSchema.parse(req.body)
    const r = await ativarAplicativo(req.userId!, codigo)
    await registrarAuditoria(req, { action: 'SEGUNDO_FATOR_ATIVADO', entityType: 'usuario', entityId: req.userId, metadata: { trocouDeAparelho: r.trocouDeAparelho } })
    res.json({ token: signSessionToken(req.userId!, r.tokenVersion, agoraEmSegundos()), codigosDeRecuperacao: r.codigosDeRecuperacao })
  })
)

segundoFatorRouter.post(
  '/codigos-de-recuperacao',
  segundoFatorLimiter,
  asyncHandler(async (req, res) => {
    if (!req.segundoFatorAtivo) throw new ApiError(409, 'Ative o login em duas etapas primeiro.')
    const { codigo } = codigoSchema.parse(req.body)
    await exigirCodigoValido(req.userId!, codigo)
    const codigos = await renovarCodigosDeRecuperacao(req.userId!)
    await registrarAuditoria(req, { action: 'SEGUNDO_FATOR_CODIGOS_RENOVADOS', entityType: 'usuario', entityId: req.userId })
    res.json({ codigosDeRecuperacao: codigos })
  })
)

segundoFatorRouter.post(
  '/confirmar',
  segundoFatorLimiter,
  asyncHandler(async (req, res) => {
    if (!req.segundoFatorAtivo) throw new ApiError(409, 'Ative o login em duas etapas primeiro.', { code: 'SEGUNDO_FATOR_PENDENTE' })
    const { codigo } = codigoSchema.parse(req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { tokenVersion: true } })
    try {
      await exigirCodigoValido(req.userId!, codigo)
    } catch (err) {
      await registrarAuditoria(req, { action: 'SEGUNDO_FATOR_INCORRETO', entityType: 'usuario', entityId: req.userId, metadata: { momento: 'confirmacao' } })
      throw err
    }
    await registrarAuditoria(req, { action: 'SEGUNDO_FATOR_CONFIRMADO', entityType: 'usuario', entityId: req.userId })
    res.json({ token: signSessionToken(req.userId!, user.tokenVersion, agoraEmSegundos()) })
  })
)
