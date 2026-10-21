// ============================================================
// api/routes/conta.ts — Direitos do titular (LGPD, art. 18): acesso/portabilidade
// dos dados (exportação em JSON) e pedido de exclusão da conta.
//
// A exclusão não é imediata de propósito: o pedido vai ao administrador, que
// confere (ex.: contrato, débitos, pedido feito por engano) e executa com
// `npm run excluir-empresa` (scripts/excluirEmpresa.ts) — a LGPD dá até 15 dias.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { verifyPasswordConstantTime } from '../../services/authService'
import { registrarAuditoria } from '../../services/auditService'
import { avisarAdministrador } from '../../services/alertaOperacional'
import { requireCompanyOwner } from '../authMiddleware'
import { changePasswordLimiter, escritaSensivelLimiter } from '../rateLimit'
import { ApiError, asyncHandler } from '../asyncHandler'
import { TERMOS_VERSAO } from '../../lib/legal'
import { excluirDadosDoUsuario, metadataDaExclusao } from '../../services/exclusaoDeUsuario'
import { CAMPO_DA_PREFERENCIA, TIPOS_DE_AVISO, type TipoDeAviso } from '../../lib/descadastro'

export const contaRouter = Router()

contaRouter.get(
  '/meus-dados',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!
    const dono = req.companyRole === 'OWNER'
    const [usuario, empresa, membros, itens, documentos, planos, checklists, exigencias, matches, analises, eventos] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId! },
        select: {
          id: true, email: true, name: true, companyRole: true, createdAt: true, emailVerifiedAt: true,
          termsAcceptedAt: true, termsVersion: true, accessExpiresAt: true, active: true,
          receberResumoDiario: true, receberLembreteDePrazo: true, receberAvisoDeDocumento: true, receberAvisoDeAlteracao: true,
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true, tipo: true, name: true, cnpj: true, cpf: true, email: true, telefone: true, responsavel: true,
          endereco: true, cep: true, planCode: true, createdAt: true,
        },
      }),
      // Outros membros: só o dono recebe a lista (os dados são de terceiros).
      dono
        ? prisma.user.findMany({ where: { companyId }, select: { email: true, name: true, companyRole: true, active: true, createdAt: true } })
        : Promise.resolve([]),
      prisma.monitoredItem.findMany({ where: { companyId } }),
      prisma.companyDocument.findMany({ where: { companyId } }),
      prisma.tenderParticipationPlan.findMany({ where: { companyId } }),
      prisma.tenderChecklist.findMany({ where: { companyId } }),
      prisma.requirementProgress.findMany({ where: { companyId } }),
      prisma.tenderMatch.count({ where: { companyId } }),
      prisma.aiUsage.count({ where: { companyId } }),
      prisma.auditLog.findMany({
        where: { companyId, ...(dono ? {} : { actorUserId: req.userId! }) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { createdAt: true, action: true, entityType: true, actorEmail: true },
      }),
    ])

    await registrarAuditoria(req, { action: 'DADOS_EXPORTADOS', entityType: 'empresa', entityId: companyId })
    const nome = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
    res.json({
      geradoEm: new Date().toISOString(),
      observacao: 'Cópia dos seus dados pessoais e da sua empresa guardados na plataforma (LGPD, art. 18).',
      usuario,
      empresa,
      membros,
      itensMonitorados: itens,
      documentosDaEmpresa: documentos,
      planosDeParticipacao: planos,
      checklists,
      progressoDeExigencias: exigencias,
      totais: { licitacoesCompativeisEncontradas: matches, analisesDeEditalSolicitadas: analises },
      historicoDeAcoes: eventos,
    })
  })
)

const pedidoSchema = z.object({
  senha: z.string().min(1).max(200),
  motivo: z.string().trim().max(1000).optional(),
})

contaRouter.post(
  '/solicitar-exclusao',
  requireCompanyOwner,
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { senha, motivo } = pedidoSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true, passwordHash: true } })
    if (!(await verifyPasswordConstantTime(senha, user?.passwordHash))) throw new ApiError(400, 'Senha incorreta.')

    const empresa = await prisma.company.findUnique({ where: { id: req.companyId! }, select: { id: true, name: true } })
    await registrarAuditoria(req, {
      action: 'EXCLUSAO_SOLICITADA',
      entityType: 'empresa',
      entityId: req.companyId!,
      metadata: motivo ? { motivo } : undefined,
    })
    void avisarAdministrador(
      `exclusao|${req.companyId}`,
      'Pedido de exclusão de conta (LGPD)',
      `Empresa: ${empresa?.name} (${empresa?.id})\nSolicitante: ${user?.email}\nMotivo: ${motivo ?? '(não informado)'}\n\n` +
        `Prazo legal: até 15 dias. Para executar:\n  npm run excluir-empresa -- --empresa ${empresa?.id} --confirmar`
    )
    res.status(202).json({
      mensagem: 'Pedido de exclusão registrado. A conta e os dados serão excluídos em até 15 dias; você receberá a confirmação por e-mail.',
    })
  })
)

contaRouter.get(
  '/termos',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { termsVersion: true, termsAcceptedAt: true } })
    res.json({
      versaoVigente: TERMOS_VERSAO,
      versaoAceita: user.termsVersion,
      aceitoEm: user.termsAcceptedAt,
      pendente: user.termsVersion !== TERMOS_VERSAO,
    })
  })
)

const aceiteSchema = z.object({ versao: z.string().min(1).max(40) })

contaRouter.post(
  '/aceitar-termos',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { versao } = aceiteSchema.parse(req.body)
    if (versao !== TERMOS_VERSAO) throw new ApiError(409, 'Os termos foram atualizados. Recarregue a página e leia a versão nova.')
    const aceitoEm = new Date()
    await prisma.user.update({ where: { id: req.userId! }, data: { termsAcceptedAt: aceitoEm, termsVersion: TERMOS_VERSAO } })
    await registrarAuditoria(req, { action: 'TERMOS_ACEITOS', entityType: 'usuario', entityId: req.userId!, metadata: { versao: TERMOS_VERSAO } })
    res.json({ versaoAceita: TERMOS_VERSAO, aceitoEm })
  })
)

const SELECT_DAS_PREFERENCIAS = {
  receberResumoDiario: true,
  receberLembreteDePrazo: true,
  receberAvisoDeDocumento: true,
  receberAvisoDeAlteracao: true,
} as const

type PreferenciasGravadas = Record<(typeof CAMPO_DA_PREFERENCIA)[TipoDeAviso], boolean>

function preferenciasPorTipo(gravadas: PreferenciasGravadas): Record<TipoDeAviso, boolean> {
  return Object.fromEntries(TIPOS_DE_AVISO.map((tipo) => [tipo, gravadas[CAMPO_DA_PREFERENCIA[tipo]]])) as Record<TipoDeAviso, boolean>
}

contaRouter.get(
  '/preferencias-de-email',
  asyncHandler(async (req, res) => {
    const gravadas = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: SELECT_DAS_PREFERENCIAS })
    res.json({ preferencias: preferenciasPorTipo(gravadas) })
  })
)

const preferenciasSchema = z
  .object(Object.fromEntries(TIPOS_DE_AVISO.map((tipo) => [tipo, z.boolean().optional()])) as Record<TipoDeAviso, z.ZodOptional<z.ZodBoolean>>)
  .strict()

contaRouter.patch(
  '/preferencias-de-email',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const pedido = preferenciasSchema.parse(req.body)
    const data: Partial<PreferenciasGravadas> = {}
    for (const tipo of TIPOS_DE_AVISO) {
      const valor = pedido[tipo]
      if (valor !== undefined) data[CAMPO_DA_PREFERENCIA[tipo]] = valor
    }
    const gravadas = await prisma.user.update({ where: { id: req.userId! }, data, select: SELECT_DAS_PREFERENCIAS })
    if (Object.keys(data).length > 0) {
      await registrarAuditoria(req, { action: 'PREFERENCIAS_DE_EMAIL_ALTERADAS', entityType: 'usuario', entityId: req.userId!, metadata: pedido })
    }
    res.json({ preferencias: preferenciasPorTipo(gravadas) })
  })
)

contaRouter.get(
  '/opcoes-de-exclusao',
  asyncHandler(async (req, res) => {
    const dono = req.companyRole === 'OWNER'
    const outrosDonosAtivos = dono
      ? await prisma.user.count({ where: { companyId: req.companyId!, companyRole: 'OWNER', active: true, id: { not: req.userId! } } })
      : 0
    res.json({
      papel: dono ? 'OWNER' : 'MEMBER',
      podeExcluirSoOsMeusDados: !dono || outrosDonosAtivos > 0,
      podePedirExclusaoDaEmpresa: dono,
    })
  })
)

const exclusaoDosMeusDadosSchema = z.object({ senha: z.string().min(1).max(200) })

contaRouter.post(
  '/excluir-meus-dados',
  changePasswordLimiter,
  asyncHandler(async (req, res) => {
    const { senha } = exclusaoDosMeusDadosSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { passwordHash: true } })
    if (!(await verifyPasswordConstantTime(senha, user?.passwordHash))) throw new ApiError(400, 'Senha incorreta.')

    const resumo = await excluirDadosDoUsuario({ userId: req.userId!, companyId: req.companyId! })
    await registrarAuditoria(
      null,
      { action: 'DADOS_PROPRIOS_EXCLUIDOS', entityType: 'usuario', entityId: resumo.userId, companyId: resumo.companyId, metadata: metadataDaExclusao(resumo) },
      { userId: null, email: null }
    )
    res.json({ mensagem: 'Seus dados pessoais foram excluídos. Os dados da empresa continuam com ela.' })
  })
)
