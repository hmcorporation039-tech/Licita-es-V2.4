import { fimDoPrazoDaLicitacao } from './dataDeBrasilia'

export type UrgenciaNoMapa = 'urgente' | 'andamento' | 'selecionada' | 'encerrada'

export interface PrazoNoMapa {
  horasRestantes: number | null
  urgencia: UrgenciaNoMapa
}

const HORA_MS = 60 * 60 * 1000
export const MAPA_URGENTE_HORAS = 48
export const MAPA_ANDAMENTO_HORAS = 7 * 24

const PRIORIDADE: Record<UrgenciaNoMapa, number> = { urgente: 3, andamento: 2, selecionada: 1, encerrada: 0 }

export function prazoNoMapa(encerramentoAt: Date | null, fonte: string, agora: number): PrazoNoMapa {
  if (!encerramentoAt) return { horasRestantes: null, urgencia: 'selecionada' }
  const restante = fimDoPrazoDaLicitacao(encerramentoAt, fonte).getTime() - agora
  const horasRestantes = Math.floor(restante / HORA_MS)
  if (restante < 0) return { horasRestantes, urgencia: 'encerrada' }
  if (restante <= MAPA_URGENTE_HORAS * HORA_MS) return { horasRestantes, urgencia: 'urgente' }
  if (restante <= MAPA_ANDAMENTO_HORAS * HORA_MS) return { horasRestantes, urgencia: 'andamento' }
  return { horasRestantes, urgencia: 'selecionada' }
}

export function urgenciaDoEstado(urgencias: UrgenciaNoMapa[]): UrgenciaNoMapa {
  return urgencias.reduce<UrgenciaNoMapa>((max, u) => (PRIORIDADE[u] > PRIORIDADE[max] ? u : max), 'encerrada')
}
