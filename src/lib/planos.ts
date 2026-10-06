// ============================================================
// lib/planos.ts — Regras puras de plano e cota (sem banco, testáveis).
// O que cada plano permite vive na tabela `plans` (editável pelo painel
// admin); aqui só se resolve "qual é o limite efetivo" e "estourou?".
// ============================================================

export const RECURSOS = ['itensMonitorados', 'usuarios', 'analisesIaMes'] as const
export type Recurso = (typeof RECURSOS)[number]

// null = ilimitado
export type LimitesDoPlano = Record<Recurso, number | null>

export const ROTULO_RECURSO: Record<Recurso, string> = {
  itensMonitorados: 'itens monitorados',
  usuarios: 'usuários',
  analisesIaMes: 'análises de edital no mês',
}

// Rede de segurança caso a tabela `plans` esteja vazia ou o plano da empresa
// tenha sido removido: o mais restritivo, nunca "ilimitado" por acidente.
export const LIMITES_PADRAO: LimitesDoPlano = {
  itensMonitorados: 3,
  usuarios: 1,
  analisesIaMes: 3,
}

function ehLimiteValido(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
}

// Lê um JSON qualquer (vindo do banco) como limites; chave ausente ou inválida
// cai no padrão restritivo.
export function lerLimites(json: unknown, base: LimitesDoPlano = LIMITES_PADRAO): LimitesDoPlano {
  const out: LimitesDoPlano = { ...base }
  if (json && typeof json === 'object') {
    for (const r of RECURSOS) {
      const v = (json as Record<string, unknown>)[r]
      if (v !== undefined && ehLimiteValido(v)) out[r] = v
    }
  }
  return out
}

// Plano + ajustes combinados com o cliente (quotaOverrides). O ajuste vence o plano.
export function limitesEfetivos(planLimits: unknown, overrides: unknown): LimitesDoPlano {
  return lerLimites(overrides, lerLimites(planLimits))
}

export function excedeu(usado: number, limite: number | null): boolean {
  return limite !== null && usado >= limite
}

// Início do PRÓXIMO mês no fuso de Brasília: quando a cota mensal de análises volta a zero.
export function inicioDoProximoMesBrasilia(agora: Date = new Date()): Date {
  const br = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + 1, 1, 3, 0, 0))
}

// Início do mês corrente no fuso de Brasília (UTC-3, sem horário de verão desde 2019).
export function inicioDoMesBrasilia(agora: Date = new Date()): Date {
  const br = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0))
}
