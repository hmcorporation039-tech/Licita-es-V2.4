// ============================================================
// lib/modalidades.ts — Opções de modalidade para o filtro de itens
// (precisa bater com ModalidadeEnum no schema.prisma / backend)
// ============================================================

export const MODALIDADE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PREGAO_ELETRONICO', label: 'Pregão Eletrônico' },
  { value: 'PREGAO_PRESENCIAL', label: 'Pregão Presencial' },
  { value: 'CONCORRENCIA', label: 'Concorrência' },
  { value: 'DISPENSA_COM_DISPUTA', label: 'Dispensa (com disputa)' },
  { value: 'DISPENSA_SEM_DISPUTA', label: 'Dispensa (sem disputa)' },
  { value: 'INEXIGIBILIDADE', label: 'Inexigibilidade' },
  { value: 'CONVITE', label: 'Convite' },
  { value: 'TOMADA_DE_PRECOS', label: 'Tomada de Preços' },
  { value: 'CONCURSO', label: 'Concurso' },
  { value: 'CREDENCIAMENTO', label: 'Credenciamento' },
  { value: 'DIALOGO_COMPETITIVO', label: 'Diálogo Competitivo' },
  { value: 'OUTROS', label: 'Outros' },
]
