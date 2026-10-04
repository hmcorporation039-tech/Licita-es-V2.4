// ============================================================
// lib/analiseParaResposta.ts — O que cada usuário pode ver de uma análise de edital.
//
//  - Usuário comum: o resultado final e o relatório da revisão. NÃO vê o RASCUNHO do
//    analista nem o detalhe técnico de erros (isso é do administrador, para auditar).
//  - Revisão "em andamento" há tempo demais (o servidor reiniciou no meio, ou travou)
//    é mostrada como NÃO revisada, em vez de ficar "em andamento" para sempre.
// ============================================================

// Uma revisão normal leva de poucos a ~10 minutos; além disto é considerada interrompida.
export const REVISAO_MAX_EM_ANDAMENTO_MS = 25 * 60 * 1000

type Rec = Record<string, unknown>

function revisaoVigente(revisao: unknown, agora: number): unknown {
  if (!revisao || typeof revisao !== 'object') return revisao
  const r = revisao as Rec
  if (r.status !== 'EM_ANDAMENTO') return revisao
  const inicio = typeof r.em === 'string' ? Date.parse(r.em) : NaN
  if (Number.isFinite(inicio) && agora - inicio <= REVISAO_MAX_EM_ANDAMENTO_MS) return revisao
  return {
    ...r,
    status: 'FALHOU',
    motivo: 'A revisão foi interrompida (o servidor reiniciou ou demorou demais): esta análise NÃO foi revisada.',
    detalheTecnico: `Revisão marcada como em andamento desde ${typeof r.em === 'string' ? r.em : 'data desconhecida'} sem concluir.`,
  }
}

export function analiseParaResposta<T extends { rascunho?: unknown; revisao?: unknown }>(analise: T, admin: boolean, agora: number = Date.now()): T {
  const revisao = revisaoVigente(analise.revisao, agora)
  if (admin) return { ...analise, revisao } as T

  const { rascunho: _rascunho, ...resto } = analise
  void _rascunho
  const publica = revisao && typeof revisao === 'object' ? { ...(revisao as Rec) } : revisao
  if (publica && typeof publica === 'object') delete (publica as Rec).detalheTecnico
  return { ...resto, revisao: publica } as unknown as T
}
