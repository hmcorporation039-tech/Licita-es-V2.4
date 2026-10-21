import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireAdmin, requireAuth } from '../authMiddleware'
import { escritaSensivelLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { errosDoChamado } from '../../services/errosDoSistema'
import { mudarStatusDoChamado, responderChamado } from '../../services/chamados'
import { diagnosticarChamado } from '../../services/diagnostico'
import { atendimentoHabilitado } from '../../services/atendimento'
import { STATUS_DE_CHAMADO, TAMANHO_MAXIMO_DA_MENSAGEM, TIPOS_DE_CHAMADO, codigosDosErros } from '../../lib/suporte'

export const adminChamadosRouter = Router()
adminChamadosRouter.use(requireAuth, requireAdmin)

const filtroSchema = z.object({
  status: z.enum(STATUS_DE_CHAMADO).optional(),
  tipo: z.enum(TIPOS_DE_CHAMADO).optional(),
})

const respostaSchema = z.object({
  texto: z.string().trim().min(2, 'Escreva a resposta').max(TAMANHO_MAXIMO_DA_MENSAGEM),
  resolver: z.boolean().optional(),
})

const statusSchema = z.object({ status: z.enum(STATUS_DE_CHAMADO) })

const errosSchema = z.object({
  origem: z.enum(['api', 'web', 'worker']).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
})

async function chamadoPeloNumero(req: Request) {
  const numero = Number((req.params as { numero: string }).numero)
  if (!Number.isInteger(numero) || numero <= 0) throw new ApiError(404, 'Chamado não encontrado')
  const chamado = await prisma.chamado.findUnique({ where: { numero }, select: { id: true, numero: true, companyId: true } })
  if (!chamado) throw new ApiError(404, 'Chamado não encontrado')
  return chamado
}

adminChamadosRouter.get(
  '/chamados',
  asyncHandler(async (req, res) => {
    const filtro = filtroSchema.parse(req.query)
    const [chamados, porStatus] = await Promise.all([
      prisma.chamado.findMany({
        where: filtro,
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
        select: {
          numero: true,
          tipo: true,
          status: true,
          origem: true,
          assunto: true,
          diagnosticoStatus: true,
          createdAt: true,
          updatedAt: true,
          company: { select: { id: true, name: true } },
          user: { select: { name: true, email: true } },
          _count: { select: { mensagens: true } },
        },
      }),
      prisma.chamado.groupBy({ by: ['status'], _count: { _all: true } }),
    ])
    res.json({
      chamados: chamados.map(({ _count, ...c }) => ({ ...c, mensagens: _count.mensagens })),
      porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
    })
  })
)

adminChamadosRouter.get(
  '/chamados/:numero',
  asyncHandler(async (req, res) => {
    const { id } = await chamadoPeloNumero(req)
    const chamado = await prisma.chamado.findUniqueOrThrow({
      where: { id },
      include: {
        company: { select: { id: true, name: true, planCode: true } },
        user: { select: { id: true, name: true, email: true, companyRole: true } },
        mensagens: { orderBy: { createdAt: 'asc' }, select: { id: true, autor: true, texto: true, createdAt: true, user: { select: { name: true } } } },
      },
    })
    const erros = await errosDoChamado({ userId: chamado.userId, createdAt: chamado.createdAt, codigos: codigosDosErros(chamado.contexto) })
    await registrarAuditoria(req, { action: 'ADMIN_CONSULTOU_CHAMADO', entityType: 'chamado', entityId: id, companyId: chamado.companyId, metadata: { numero: chamado.numero } })
    res.json({ ...chamado, erros })
  })
)

adminChamadosRouter.post(
  '/chamados/:numero/mensagens',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { texto, resolver } = respostaSchema.parse(req.body)
    const chamado = await chamadoPeloNumero(req)
    const { mensagem } = await responderChamado({ chamadoId: chamado.id, autor: 'SUPORTE', userId: req.userId!, texto })
    const final = resolver ? await mudarStatusDoChamado(chamado.id, 'RESOLVIDO') : null
    await registrarAuditoria(req, { action: 'CHAMADO_RESPONDIDO', entityType: 'chamado', entityId: chamado.id, companyId: chamado.companyId, metadata: { numero: chamado.numero, resolvido: Boolean(resolver) } })
    res.status(201).json({ id: mensagem.id, status: final?.status ?? 'AGUARDANDO_CLIENTE' })
  })
)

adminChamadosRouter.patch(
  '/chamados/:numero',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body)
    const chamado = await chamadoPeloNumero(req)
    const atualizado = await mudarStatusDoChamado(chamado.id, status)
    await registrarAuditoria(req, { action: 'CHAMADO_STATUS_ALTERADO', entityType: 'chamado', entityId: chamado.id, companyId: chamado.companyId, metadata: { numero: chamado.numero, status } })
    res.json(atualizado)
  })
)

adminChamadosRouter.get(
  '/erros',
  asyncHandler(async (req, res) => {
    const { origem, pagina } = errosSchema.parse(req.query)
    const where = origem ? { origem } : {}
    const porPagina = 50
    const [erros, total] = await Promise.all([
      prisma.erroDoSistema.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: { id: true, origem: true, codigoDeRastreio: true, metodo: true, rota: true, status: true, mensagem: true, pilha: true, tela: true, versao: true, createdAt: true, company: { select: { name: true } } },
      }),
      prisma.erroDoSistema.count({ where }),
    ])
    res.json({ erros, total, pagina, porPagina })
  })
)

adminChamadosRouter.post(
  '/chamados/:numero/diagnostico',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    if (!atendimentoHabilitado()) throw new ApiError(503, 'A IA está desligada nesta instalação')
    const chamado = await chamadoPeloNumero(req)
    const resultado = await diagnosticarChamado(chamado.id, { forcar: true })
    if (resultado === 'IGNORADO') throw new ApiError(409, 'Já existe um diagnóstico sendo feito para este chamado. Aguarde alguns minutos.')
    const atualizado = await prisma.chamado.findUniqueOrThrow({ where: { id: chamado.id }, select: { diagnostico: true, diagnosticoStatus: true, diagnosticoEm: true } })
    res.json(atualizado)
  })
)
