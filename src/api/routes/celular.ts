import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import { escritaSensivelLimiter } from '../rateLimit'
import { ApiError, asyncHandler } from '../asyncHandler'
import { chavePublicaDoCelular, enviarNoCelular } from '../../services/notificacaoNoCelular'
import {
  CAMPO_DO_AVISO_NO_CELULAR,
  MENSAGEM_DE_TESTE,
  TIPOS_DE_AVISO_NO_CELULAR,
  descreverAparelho,
  enderecoDeEntregaAceito,
  type CampoDoAvisoNoCelular,
  type TipoDeAvisoNoCelular,
} from '../../lib/notificacaoNoCelular'

export const celularRouter = Router()

export const MAXIMO_DE_APARELHOS_POR_USUARIO = 10

const SELECT_DAS_PREFERENCIAS = { celularNovasLicitacoes: true, celularLembreteDePrazo: true, celularAvisoDeAlteracao: true } as const

type PreferenciasGravadas = Record<CampoDoAvisoNoCelular, boolean>

function preferenciasPorTipo(gravadas: PreferenciasGravadas): Record<TipoDeAvisoNoCelular, boolean> {
  return Object.fromEntries(TIPOS_DE_AVISO_NO_CELULAR.map((tipo) => [tipo, gravadas[CAMPO_DO_AVISO_NO_CELULAR[tipo]]])) as Record<TipoDeAvisoNoCelular, boolean>
}

function exigirCelularConfigurado() {
  if (!chavePublicaDoCelular()) throw new ApiError(503, 'As notificações no celular ainda não estão disponíveis.')
}

celularRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [gravadas, aparelhos] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: SELECT_DAS_PREFERENCIAS }),
      prisma.pushSubscription.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: 'desc' },
        select: { id: true, aparelho: true, createdAt: true, ultimoEnvioEm: true },
      }),
    ])
    const chavePublica = chavePublicaDoCelular()
    res.json({ disponivel: chavePublica !== null, chavePublica, preferencias: preferenciasPorTipo(gravadas), aparelhos })
  })
)

const inscricaoSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .max(1000)
    .refine(enderecoDeEntregaAceito, 'Este navegador não é aceito para notificações. Use Chrome, Safari, Edge ou Firefox atualizados.'),
  keys: z.object({ p256dh: z.string().trim().min(20).max(200), auth: z.string().trim().min(8).max(100) }),
})

celularRouter.post(
  '/aparelhos',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    exigirCelularConfigurado()
    const { endpoint, keys } = inscricaoSchema.parse(req.body)
    const userId = req.userId!
    const aparelho = descreverAparelho(req.get('user-agent'))
    const anterior = await prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } })
    const gravado = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, aparelho },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, aparelho, falhasSeguidas: 0 },
      select: { id: true },
    })
    const excedentes = await prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAXIMO_DE_APARELHOS_POR_USUARIO,
      select: { id: true },
    })
    if (excedentes.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: excedentes.map((e) => e.id) } } })
    if (anterior?.userId !== userId) {
      await registrarAuditoria(req, { action: 'CELULAR_ATIVADO', entityType: 'usuario', entityId: userId, metadata: aparelho ? { aparelho } : undefined })
    }
    res.status(anterior ? 200 : 201).json({ id: gravado.id })
  })
)

const remocaoSchema = z
  .object({ endpoint: z.string().trim().max(1000).optional(), id: z.string().uuid().optional() })
  .refine((r) => Boolean(r.endpoint || r.id), 'Informe o aparelho.')

celularRouter.delete(
  '/aparelhos',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { endpoint, id } = remocaoSchema.parse(req.body ?? {})
    const { count } = await prisma.pushSubscription.deleteMany({ where: { userId: req.userId!, ...(id ? { id } : { endpoint }) } })
    if (count > 0) await registrarAuditoria(req, { action: 'CELULAR_DESATIVADO', entityType: 'usuario', entityId: req.userId! })
    res.status(204).end()
  })
)

celularRouter.post(
  '/teste',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    exigirCelularConfigurado()
    const resultado = await enviarNoCelular(req.userId!, MENSAGEM_DE_TESTE, { urgente: true })
    if (resultado.aparelhos === 0) throw new ApiError(409, 'Nenhum aparelho ativado. Ative as notificações neste aparelho primeiro.')
    res.json(resultado)
  })
)

const preferenciasSchema = z
  .object(
    Object.fromEntries(TIPOS_DE_AVISO_NO_CELULAR.map((tipo) => [tipo, z.boolean().optional()])) as Record<TipoDeAvisoNoCelular, z.ZodOptional<z.ZodBoolean>>
  )
  .strict()

celularRouter.patch(
  '/preferencias',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const pedido = preferenciasSchema.parse(req.body)
    const data: Partial<PreferenciasGravadas> = {}
    for (const tipo of TIPOS_DE_AVISO_NO_CELULAR) {
      const valor = pedido[tipo]
      if (valor !== undefined) data[CAMPO_DO_AVISO_NO_CELULAR[tipo]] = valor
    }
    const gravadas = await prisma.user.update({ where: { id: req.userId! }, data, select: SELECT_DAS_PREFERENCIAS })
    if (Object.keys(data).length > 0) {
      await registrarAuditoria(req, { action: 'PREFERENCIAS_DO_CELULAR_ALTERADAS', entityType: 'usuario', entityId: req.userId!, metadata: pedido })
    }
    res.json({ preferencias: preferenciasPorTipo(gravadas) })
  })
)
