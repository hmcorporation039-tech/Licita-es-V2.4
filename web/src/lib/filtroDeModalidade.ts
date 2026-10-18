import { MODALIDADE_OPTIONS } from './modalidades'

export interface GrupoDeModalidades {
  value: string
  label: string
  modalidades: string[]
}

export const GRUPOS_DE_MODALIDADE: GrupoDeModalidades[] = [
  { value: 'DISPENSA', label: 'Dispensa (todas)', modalidades: ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'] },
]

export const VALOR_DE_VARIAS_MODALIDADES = 'VARIAS'

const MODALIDADES_CONHECIDAS = new Set(MODALIDADE_OPTIONS.map((o) => o.value))

export function lerModalidadesDaUrl(bruto: string | null | undefined): string[] {
  const pedidas = (bruto ?? '').slice(0, 400).toUpperCase().split(/[\s,;]+/).filter(Boolean)
  const lidas: string[] = []
  for (const pedida of pedidas) {
    const grupo = GRUPOS_DE_MODALIDADE.find((g) => g.value === pedida)
    for (const modalidade of grupo ? grupo.modalidades : [pedida]) {
      if (MODALIDADES_CONHECIDAS.has(modalidade) && !lidas.includes(modalidade)) lidas.push(modalidade)
    }
  }
  return lidas
}

function mesmasModalidades(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((m) => b.includes(m))
}

export function valorDoSeletorDeModalidade(modalidades: string[]): string {
  if (modalidades.length === 0) return ''
  if (modalidades.length === 1) return modalidades[0]
  return GRUPOS_DE_MODALIDADE.find((g) => mesmasModalidades(g.modalidades, modalidades))?.value ?? VALOR_DE_VARIAS_MODALIDADES
}

export function modalidadesDoSeletor(valor: string, atuais: string[]): string[] {
  if (valor === VALOR_DE_VARIAS_MODALIDADES) return atuais
  return lerModalidadesDaUrl(valor)
}

export function rotuloDasModalidades(modalidades: string[]): string {
  const grupo = GRUPOS_DE_MODALIDADE.find((g) => mesmasModalidades(g.modalidades, modalidades))
  if (grupo) return grupo.label
  const rotulos = modalidades.map((m) => MODALIDADE_OPTIONS.find((o) => o.value === m)?.label ?? m)
  return rotulos.length <= 1 ? (rotulos[0] ?? '') : `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`
}

export function parametroDeModalidade(modalidades: string[]): string | null {
  return modalidades.length > 0 ? modalidades.join(',') : null
}
