import { aberturaEhInicioDasPropostas } from './dataDaSessao'
import { fimDoPrazoDaLicitacao } from './dataDeBrasilia'

const HORA_MS = 60 * 60 * 1000

export const MARCOS_DO_LEMBRETE_EM_HORAS = [24, 48] as const

export type MarcoDoLembrete = (typeof MARCOS_DO_LEMBRETE_EM_HORAS)[number]

export interface DatasDoPrazo {
  fonte: string
  encerramentoAt: Date | null
  aberturaAt: Date | null
}

export function dataDoPrazoDaLicitacao(licitacao: DatasDoPrazo): Date | null {
  if (licitacao.encerramentoAt) return licitacao.encerramentoAt
  if (licitacao.aberturaAt && !aberturaEhInicioDasPropostas(licitacao.fonte)) return licitacao.aberturaAt
  return null
}

export function momentoDoFimDoPrazo(licitacao: DatasDoPrazo): Date | null {
  const data = dataDoPrazoDaLicitacao(licitacao)
  return data ? fimDoPrazoDaLicitacao(data, licitacao.fonte) : null
}

export function marcoDoLembrete(fimDoPrazo: Date, agora: Date): MarcoDoLembrete | null {
  const restante = fimDoPrazo.getTime() - agora.getTime()
  if (restante <= 0) return null
  return MARCOS_DO_LEMBRETE_EM_HORAS.find((marco) => restante <= marco * HORA_MS) ?? null
}

export function textoDoTempoRestante(fimDoPrazo: Date, agora: Date): string {
  const horas = Math.floor((fimDoPrazo.getTime() - agora.getTime()) / HORA_MS)
  if (horas < 1) return 'falta menos de 1 hora'
  return horas === 1 ? 'falta 1 hora' : `faltam ${horas} horas`
}
