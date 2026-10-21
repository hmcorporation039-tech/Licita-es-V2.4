import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { errosDaTelaLimiter, suporteLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { registrarErro } from '../../services/errosDoSistema'
import { abrirChamado, responderChamado } from '../../services/chamados'
import {
  MAX_CHAMADOS_POR_DIA,
  MAX_ERROS_RECENTES_NO_CHAMADO,
  TAMANHO_MAXIMO_DA_MENSAGEM,
  TAMANHO_MAXIMO_DO_ASSUNTO,
  TAMANHO_MAXIMO_DO_RELATO,
  TIPOS_DE_CHAMADO,
} from '../../lib/suporte'

export const suporteRouter = Router()

const texto = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, `Escreva ${campo}`)
    .max(max, `${campo[0].toUpperCase()}${campo.slice(1)} pode ter até ${max} caracteres`)

const erroRecenteSchema = z.object({
  codigo: z.string().max(64).optional(),
  rota: z.string().max(300).optional(),
  status: z.number().int().optional(),
  mensagem: z.string().max(500).optional(),
  quando: z.string().max(40).optional(),
})

const chamadoSchema = z.object({
  tipo: z.enum(TIPOS_DE_CHAMADO),
  assunto: texto(3, TAMANHO_MAXIMO_DO_ASSUNTO, 'o assunto'),
  relato: texto(10, TAMANHO_MAXIMO_DO_RELATO, 'o que aconteceu'),
  tela: z.string().max(300).nullish(),
  errosRecentes: z.array(erroRecenteSchema).max(MAX_ERROS_RECENTES_NO_CHAMADO * 2).optional(),
})

const mensagemSchema = z.object({ texto: texto(2, TAMANHO_MAXIMO_DA_MENSAGEM, 'a mensagem') })

const erroDaTelaSchema = z.object({
  mensagem: z.string().trim().min(1).max(1000),
  pilha: z.string().max(4000).nullish(),
  tela: z.string().max(300).nullish(),
  codigoDeRastreio: z.string().max(64).nullish(),
})

function ondeOUsuarioVe(req: Request) {
  return req.companyRole === 'OWNER' ? { companyId: req.companyId! } : { companyId: req.companyId!, userId: req.userId! }
}

function numeroDoChamado(req: Request): number {
  const numero = Number((req.params as { numero: string }).numero)
  if (!Number.isInteger(numero) || numero <= 0) throw new ApiError(404, 'Chamado não encontrado')
  return numero
}

suporteRouter.post(
  '/erros',
  errosDaTelaLimiter,
  asyncHandler(async (req, res) => {
    const erro = erroDaTelaSchema.parse(req.body)
    await registrarErro({
      origem: 'web',
      mensagem: erro.mensagem,
      pilha: erro.pilha,
      tela: erro.tela,
      codigoDeRastreio: erro.codigoDeRastreio,
      navegador: req.header('user-agent'),
      userId: req.userId,
      companyId: req.companyId,
    })
    res.status(204).end()
  })
)

suporteRouter.get(
  '/chamados',
  asyncHandler(async (req, res) => {
    const chamados = await prisma.chamado.findMany({
      where: ondeOUsuarioVe(req),
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { numero: true, tipo: true, status: true, assunto: true, createdAt: true, updatedAt: true, user: { select: { name: true } }, _count: { select: { mensagens: true } } },
    })
    res.json(chamados.map(({ user, _count, ...c }) => ({ ...c, autor: user?.name ?? null, mensagens: _count.mensagens })))
  })
)

suporteRouter.post(
  '/chamados',
  suporteLimiter,
  asyncHandler(async (req, res) => {
    const dados = chamadoSchema.parse(req.body)
    const hoje = await prisma.chamado.count({ where: { userId: req.userId!, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    if (hoje >= MAX_CHAMADOS_POR_DIA && !req.isAdmin) throw new ApiError(429, 'Você já abriu muitos chamados hoje. Responda num chamado aberto ou aguarde até amanhã.')
    const chamado = await abrirChamado({
      companyId: req.companyId!,
      userId: req.userId!,
      tipo: dados.tipo,
      assunto: dados.assunto,
      relato: dados.relato,
      tela: dados.tela,
      navegador: req.header('user-agent'),
      errosRecentes: dados.errosRecentes,
    })
    await registrarAuditoria(req, { action: 'CHAMADO_ABERTO', entityType: 'chamado', entityId: chamado.id, metadata: { numero: chamado.numero, tipo: dados.tipo } })
    res.status(201).json({ numero: chamado.numero, status: chamado.status })
  })
)

suporteRouter.get(
  '/chamados/:numero',
  asyncHandler(async (req, res) => {
    const chamado = await prisma.chamado.findFirst({
      where: { numero: numeroDoChamado(req), ...ondeOUsuarioVe(req) },
      select: {
        numero: true,
        tipo: true,
        status: true,
        assunto: true,
        relato: true,
        createdAt: true,
        resolvidoEm: true,
        user: { select: { name: true } },
        mensagens: { orderBy: { createdAt: 'asc' }, select: { id: true, autor: true, texto: true, createdAt: true, user: { select: { name: true } } } },
      },
    })
    if (!chamado) throw new ApiError(404, 'Chamado não encontrado')
    const { user, mensagens, ...resto } = chamado
    res.json({
      ...resto,
      autor: user?.name ?? null,
      mensagens: mensagens.map((m) => ({ id: m.id, autor: m.autor, texto: m.texto, createdAt: m.createdAt, nome: m.autor === 'SUPORTE' ? 'Suporte Licita Bela' : (m.user?.name ?? null) })),
    })
  })
)

suporteRouter.post(
  '/chamados/:numero/mensagens',
  suporteLimiter,
  asyncHandler(async (req, res) => {
    const { texto: corpo } = mensagemSchema.parse(req.body)
    const chamado = await prisma.chamado.findFirst({ where: { numero: numeroDoChamado(req), ...ondeOUsuarioVe(req) }, select: { id: true } })
    if (!chamado) throw new ApiError(404, 'Chamado não encontrado')
    const { mensagem, status } = await responderChamado({ chamadoId: chamado.id, autor: 'CLIENTE', userId: req.userId!, texto: corpo })
    res.status(201).json({ id: mensagem.id, status })
  })
)
