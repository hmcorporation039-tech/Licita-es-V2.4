// ============================================================
// services/exclusaoDeEmpresa.ts — Exclui definitivamente uma empresa cliente e os
// dados pessoais dela (pedido de exclusão, LGPD art. 18, VI). Executado pelo
// administrador via scripts/excluirEmpresa.ts, depois de conferir o pedido.
//
// O que some: usuários, itens monitorados, matches, documentos, planos, checklists,
// progresso de exigências, notificações e tokens.
// O que fica, ANONIMIZADO: trilha de auditoria (sem e-mail) e consumo de IA (sem
// usuário) — necessários para a contabilidade e a segurança da plataforma, sem
// identificar a pessoa. Análises de edital ficam: são do edital público, não do cliente.
// ============================================================

import { prisma } from './tenderService'

export interface ResumoDaExclusao {
  empresa: { id: string; name: string }
  usuarios: number
  itensMonitorados: number
  matches: number
  documentos: number
  planos: number
  checklists: number
  exigencias: number
  notificacoes: number
  executada: boolean
}

export class ExclusaoRecusadaError extends Error {}

// executar=false: só conta o que seria apagado (para conferir antes).
export async function excluirEmpresa(companyId: string, executar: boolean): Promise<ResumoDaExclusao> {
  const empresa = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } })
  if (!empresa) throw new ExclusaoRecusadaError('Empresa não encontrada.')
  const usuarios = await prisma.user.findMany({ where: { companyId }, select: { id: true, isAdmin: true } })
  if (usuarios.some((u) => u.isAdmin)) {
    throw new ExclusaoRecusadaError('A empresa tem um administrador da plataforma: retire o perfil de admin antes de excluir.')
  }
  const ids = usuarios.map((u) => u.id)

  const [itensMonitorados, matches, documentos, planos, checklists, exigencias, notificacoes] = await Promise.all([
    prisma.monitoredItem.count({ where: { companyId } }),
    prisma.tenderMatch.count({ where: { companyId } }),
    prisma.companyDocument.count({ where: { companyId } }),
    prisma.tenderParticipationPlan.count({ where: { companyId } }),
    prisma.tenderChecklist.count({ where: { companyId } }),
    prisma.requirementProgress.count({ where: { companyId } }),
    prisma.notification.count({ where: { userId: { in: ids } } }),
  ])
  const resumo: ResumoDaExclusao = {
    empresa,
    usuarios: ids.length,
    itensMonitorados,
    matches,
    documentos,
    planos,
    checklists,
    exigencias,
    notificacoes,
    executada: false,
  }
  if (!executar) return resumo

  await prisma.$transaction([
    prisma.tenderMatch.deleteMany({ where: { companyId } }),
    prisma.monitoredItem.deleteMany({ where: { companyId } }),
    prisma.companyDocument.deleteMany({ where: { companyId } }),
    prisma.tenderParticipationPlan.deleteMany({ where: { companyId } }),
    prisma.tenderChecklist.deleteMany({ where: { companyId } }),
    prisma.requirementProgress.deleteMany({ where: { companyId } }),
    prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
    prisma.authToken.deleteMany({ where: { userId: { in: ids } } }),
    prisma.aiUsage.updateMany({ where: { userId: { in: ids } }, data: { userId: null } }),
    prisma.auditLog.updateMany({ where: { OR: [{ companyId }, { actorUserId: { in: ids } }] }, data: { actorEmail: null, actorUserId: null, ip: null, userAgent: null } }),
    prisma.user.deleteMany({ where: { companyId } }),
    prisma.company.delete({ where: { id: companyId } }),
    prisma.auditLog.create({
      data: { action: 'EMPRESA_EXCLUIDA', entityType: 'empresa', entityId: companyId, metadata: { usuarios: ids.length } },
    }),
  ])
  return { ...resumo, executada: true }
}
