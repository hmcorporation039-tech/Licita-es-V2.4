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

const ROTULO_POR_VALOR = new Map(MODALIDADE_OPTIONS.map((o) => [o.value, o.label]))
const ORDEM_POR_VALOR = new Map(MODALIDADE_OPTIONS.map((o, i) => [o.value, i]))

export function rotuloDaModalidade(value: string): string {
  return ROTULO_POR_VALOR.get(value) ?? value
}

export function agruparPorModalidade<T>(itens: T[], modalidadeDe: (item: T) => string): { value: string; label: string; itens: T[] }[] {
  const porValor = new Map<string, T[]>()
  for (const item of itens) {
    const valor = modalidadeDe(item)
    const grupo = porValor.get(valor)
    if (grupo) grupo.push(item)
    else porValor.set(valor, [item])
  }
  return Array.from(porValor.entries())
    .map(([value, itens]) => ({ value, label: rotuloDaModalidade(value), itens }))
    .sort((a, b) => (ORDEM_POR_VALOR.get(a.value) ?? 999) - (ORDEM_POR_VALOR.get(b.value) ?? 999))
}
