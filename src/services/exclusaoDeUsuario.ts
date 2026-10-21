import { prisma } from './tenderService'
import { ApiError } from '../api/asyncHandler'

export class ExclusaoDeUsuarioRecusadaError extends ApiError {
  constructor(message: string, status: number) {
    super(status, message)
  }
}

export interface ResumoDaExclusaoDoUsuario {
  userId: string
  companyId: string
  herdeiroId: string
  reatribuidos: {
    itensMonitorados: number
    matches: number
    checklists: number
    planos: number
    documentos: number
    estudos: number
  }
  lancesAnonimizados: number
  notificacoesApagadas: number
  registrosDeAuditoriaAnonimizados: number
  consumosDeIaAnonimizados: number
}

export interface PedidoDeExclusaoDoUsuario {
  userId: string
  companyId: string
  herdeiroId?: string
}

async function escolherHerdeiro(userId: string, companyId: string, papel: string, herdeiroInformado?: string): Promise<string> {
  if (herdeiroInformado) {
    const herdeiro = await prisma.user.findUnique({ where: { id: herdeiroInformado }, select: { id: true, companyId: true } })
    if (!herdeiro || herdeiro.companyId !== companyId || herdeiro.id === userId) {
      throw new ExclusaoDeUsuarioRecusadaError('Quem recebe os dados precisa ser outro usuário da mesma empresa.', 400)
    }
    return herdeiro.id
  }
  const outroDonoAtivo = await prisma.user.findFirst({
    where: { companyId, companyRole: 'OWNER', active: true, id: { not: userId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (outroDonoAtivo) return outroDonoAtivo.id
  if (papel === 'OWNER') {
    throw new ExclusaoDeUsuarioRecusadaError(
      'Você é o único dono ativo da empresa. Para excluir a conta, peça a exclusão da empresa inteira ou promova outro usuário a dono antes.',
      409
    )
  }
  const outroUsuario = await prisma.user.findFirst({
    where: { companyId, id: { not: userId } },
    orderBy: [{ companyRole: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  if (!outroUsuario) {
    throw new ExclusaoDeUsuarioRecusadaError('A empresa não tem outro usuário para ficar com os dados dela. Fale com o suporte.', 409)
  }
  return outroUsuario.id
}

export async function excluirDadosDoUsuario(pedido: PedidoDeExclusaoDoUsuario): Promise<ResumoDaExclusaoDoUsuario> {
  const { userId, companyId } = pedido
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, companyId: true, companyRole: true, isAdmin: true } })
  if (!usuario || usuario.companyId !== companyId) throw new ExclusaoDeUsuarioRecusadaError('Usuário não encontrado.', 404)
  if (usuario.isAdmin) {
    throw new ExclusaoDeUsuarioRecusadaError('Esta conta é de administrador da plataforma: retire o perfil de admin antes de excluir.', 409)
  }
  const herdeiroId = await escolherHerdeiro(userId, companyId, usuario.companyRole, pedido.herdeiroId)
  const doUsuario = { where: { userId }, data: { userId: herdeiroId } }

  const [itensMonitorados, matches, checklists, planos, documentos, estudos, lances, , notificacoes, consumos, auditoria] = await prisma.$transaction([
    prisma.monitoredItem.updateMany(doUsuario),
    prisma.tenderMatch.updateMany(doUsuario),
    prisma.tenderChecklist.updateMany(doUsuario),
    prisma.tenderParticipationPlan.updateMany(doUsuario),
    prisma.companyDocument.updateMany(doUsuario),
    prisma.costStudy.updateMany(doUsuario),
    prisma.pregaoLance.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.authToken.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.aiUsage.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.auditLog.updateMany({
      where: { OR: [{ actorUserId: userId }, { actorEmail: usuario.email }] },
      data: { actorUserId: null, actorEmail: null, ip: null, userAgent: null },
    }),
    prisma.$executeRaw`UPDATE "audit_logs" SET "metadata" = "metadata" - 'email' WHERE "metadata"->>'email' = ${usuario.email}`,
    prisma.user.delete({ where: { id: userId } }),
  ])

  return {
    userId,
    companyId,
    herdeiroId,
    reatribuidos: {
      itensMonitorados: itensMonitorados.count,
      matches: matches.count,
      checklists: checklists.count,
      planos: planos.count,
      documentos: documentos.count,
      estudos: estudos.count,
    },
    lancesAnonimizados: lances.count,
    notificacoesApagadas: notificacoes.count,
    registrosDeAuditoriaAnonimizados: auditoria.count,
    consumosDeIaAnonimizados: consumos.count,
  }
}

export function metadataDaExclusao(resumo: ResumoDaExclusaoDoUsuario): Record<string, unknown> {
  return {
    dadosDaEmpresaReatribuidosA: resumo.herdeiroId,
    ...resumo.reatribuidos,
    lancesAnonimizados: resumo.lancesAnonimizados,
    notificacoesApagadas: resumo.notificacoesApagadas,
    registrosDeAuditoriaAnonimizados: resumo.registrosDeAuditoriaAnonimizados,
  }
}
