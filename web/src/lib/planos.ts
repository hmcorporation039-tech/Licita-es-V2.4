import type { Limites } from './adminTypes'

function quantidade(valor: number, singular: string, plural: string): string {
  return `${valor.toLocaleString('pt-BR')} ${valor === 1 ? singular : plural}`
}

export function resumoDosLimites(limites: Limites | null | undefined): string | null {
  if (!limites) return null
  const partes = [
    limites.itensMonitorados !== null ? quantidade(limites.itensMonitorados, 'item monitorado', 'itens monitorados') : null,
    limites.usuarios !== null ? quantidade(limites.usuarios, 'usuário', 'usuários') : null,
    limites.analisesIaMes !== null ? quantidade(limites.analisesIaMes, 'análise de edital', 'análises de edital') : null,
  ].filter((p): p is string => p !== null)
  if (partes.length === 0) return null
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
  return `até ${lista}`
}
