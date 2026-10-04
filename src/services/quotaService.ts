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

export async function usoDaEmpresa(companyId: string): Promise<UsoDaEmpresa> {
  const [itensMonitorados, usuarios, analisesIaMes] = await Promise.all([
    // Conta todos (ativos ou não): senão desativar e recriar burlaria o limite.
    prisma.monitoredItem.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, active: true } }),
    // A revisão (2ª chamada) é custo nosso, não do cliente: só a etapa "analise" conta na cota.
    prisma.aiUsage.count({ where: { companyId, status: 'OK', etapa: 'analise', createdAt: { gte: inicioDoMesBrasilia() } } }),
  ])
  return { itensMonitorados, usuarios, analisesIaMes }
}

export async function resumoDeCotas(companyId: string) {
  const [{ planCode, planName, limites }, uso] = await Promise.all([limitesDaEmpresa(companyId), usoDaEmpresa(companyId)])
  return {
    plano: { codigo: planCode, nome: planName },
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
