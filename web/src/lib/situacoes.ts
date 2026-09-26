// ============================================================
// lib/situacoes.ts — Opções de situação para o filtro de licitações
// (precisa bater com SituacaoEnum no schema.prisma / backend)
// ============================================================

export const SITUACAO_OPTIONS: { value: string; label: string }[] = [
  { value: 'ABERTA', label: 'Aberta' },
  { value: 'ENCERRADA', label: 'Encerrada' },
  { value: 'SUSPENSA', label: 'Suspensa' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'ANULADA', label: 'Anulada' },
  { value: 'HOMOLOGADA', label: 'Homologada' },
  { value: 'REVOGADA', label: 'Revogada' },
]
