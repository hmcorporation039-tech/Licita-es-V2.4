// ============================================================
// services/quotaService.ts — Cotas por plano. A regra pura mora em
// lib/planos.ts; aqui só se lê o plano da empresa e se mede o uso no banco.
// O administrador da plataforma (isAdmin) nunca é limitado.
// ============================================================

import { prisma } from './tenderService'
import { ApiError } from '../api/asyncHandler'
import {
  LimitesDoPlano,
  RECURSOS,
  ROTULO_RECURSO,
  Recurso,
  excedeu,
  inicioDoMesBrasilia,
  inicioDoProximoMesBrasilia,
  limitesEfetivos,
} from '../lib/planos'

export type UsoDaEmpresa = Record<Recurso, number>

export async function limitesDaEmpresa(companyId: string): Promise<{ planCode: string; planName: string; limites: LimitesDoPlano }> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { planCode: true, quotaOverrides: true },
  })
  const plano = await prisma.subscriptionPlan.findUnique({ where: { code: company.planCode } })
  return {
    planCode: company.planCode,
    planName: plano?.name ?? company.planCode,
    // Plano removido/inexistente: cai no padrão restritivo (ver lib/planos.ts).
    limites: limitesEfetivos(plano?.limits, company.quotaOverrides),
  }
}

// Análises que a empresa pediu e ainda não terminaram. Elas ainda não gravaram consumo (AiUsage só
// é gravado ao terminar), então sem isto era possível pedir dezenas de análises de uma vez, todas
// passando pela cota, e o custo de IA estourar o plano. O pedido fica na auditoria (ANALISE_SOLICITADA).
export const JANELA_EM_ANDAMENTO_MS = 30 * 60 * 1000
export const MAX_ANALISES_POR_HORA = 10

export async function analisesEmAndamento(companyId: string, agora: Date = new Date()): Promise<number> {
  const pedidos = await prisma.auditLog.findMany({
    where: { companyId, action: 'ANALISE_SOLICITADA', createdAt: { gte: new Date(agora.getTime() - JANELA_EM_ANDAMENTO_MS) } },
    select: { entityId: true },
    take: 200,
  })
  const ids = [...new Set(pedidos.map((p) => p.entityId).filter((i): i is string => !!i))]
  if (ids.length === 0) return 0
  return prisma.tenderAnalysis.count({ where: { tenderId: { in: ids }, status: { in: ['PENDING', 'RUNNING'] } } })
}

// Teto de pedidos por hora, mesmo que falhem: repetir uma análise que falhou gasta IA de novo e
// a falha (AiUsage "ERRO") não conta na cota.
export async function pedidosDeAnaliseNaUltimaHora(companyId: string, agora: Date = new Date()): Promise<number> {
  return prisma.auditLog.count({
    where: { companyId, action: 'ANALISE_SOLICITADA', createdAt: { gte: new Date(agora.getTime() - 60 * 60 * 1000) } },
  })
}

export async function usoDaEmpresa(companyId: string): Promise<UsoDaEmpresa> {
  const [itensMonitorados, usuarios, analisesConcluidas, emAndamento] = await Promise.all([
    // Conta todos (ativos ou não): senão desativar e recriar burlaria o limite.
    prisma.monitoredItem.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, active: true } }),
    // A revisão (2ª chamada) é custo nosso, não do cliente: só a etapa "analise" conta na cota.
    prisma.aiUsage.count({ where: { companyId, status: 'OK', etapa: 'analise', createdAt: { gte: inicioDoMesBrasilia() } } }),
    analisesEmAndamento(companyId),
  ])
  return { itensMonitorados, usuarios, analisesIaMes: analisesConcluidas + emAndamento }
}

export async function resumoDeCotas(companyId: string) {
  const [{ planCode, planName, limites }, uso] = await Promise.all([limitesDaEmpresa(companyId), usoDaEmpresa(companyId)])
  return {
    plano: { codigo: planCode, nome: planName },
    // Quando a contagem mensal de análises volta a zero (1º dia do mês, horário de Brasília).
    renovaEm: inicioDoProximoMesBrasilia().toISOString(),
    recursos: RECURSOS.map((r) => ({
      recurso: r,
      rotulo: ROTULO_RECURSO[r],
      usado: uso[r],
      limite: limites[r],
      excedido: excedeu(uso[r], limites[r]),
    })),
  }
}

// Lança 402 se criar mais um do recurso estouraria o limite do plano.
// A checagem é aproximada sob concorrência (duas requisições simultâneas podem
// passar juntas); o pior caso é exceder o limite em uma unidade.
export async function exigirCota(companyId: string, recurso: Recurso, isAdmin = false): Promise<void> {
  if (isAdmin) return
  const [{ planName, limites }, uso] = await Promise.all([limitesDaEmpresa(companyId), usoDaEmpresa(companyId)])
  const limite = limites[recurso]
  if (!excedeu(uso[recurso], limite)) return
  throw new ApiError(
    402,
    `Limite do plano ${planName} atingido: ${limite} ${ROTULO_RECURSO[recurso]}. Fale com o administrador para ampliar o plano.`,
    { code: 'COTA_EXCEDIDA', recurso, limite, usado: uso[recurso] }
  )
}
