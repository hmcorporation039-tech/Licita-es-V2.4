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

export type SituacaoDoRecurso = 'sem-limite' | 'livre' | 'perto' | 'no-limite' | 'excedido'

export function situacaoDoRecurso(usado: number, limite: number | null): SituacaoDoRecurso {
  if (limite === null) return 'sem-limite'
  if (usado > limite) return 'excedido'
  if (usado === limite) return 'no-limite'
  return usado / limite >= 0.8 ? 'perto' : 'livre'
}

export interface AvisoDoPlano {
  tom: 'perigo' | 'info'
  texto: string
}

function juntar(rotulos: string[]): string {
  return rotulos.length <= 1 ? (rotulos[0] ?? '') : `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`
}

export function avisoDoUsoDoPlano(recursos: { rotulo: string; usado: number; limite: number | null }[]): AvisoDoPlano | null {
  const excedidos = recursos.filter((r) => situacaoDoRecurso(r.usado, r.limite) === 'excedido').map((r) => r.rotulo)
  if (excedidos.length > 0) {
    return { tom: 'perigo', texto: `Você passou do limite do plano em ${juntar(excedidos)}. Fale com o administrador para ampliá-lo.` }
  }
  const noLimite = recursos.filter((r) => situacaoDoRecurso(r.usado, r.limite) === 'no-limite').map((r) => r.rotulo)
  if (noLimite.length > 0) {
    return { tom: 'info', texto: `Você já usa tudo o que o plano inclui em ${juntar(noLimite)}. Para adicionar mais, fale com o administrador.` }
  }
  return null
}
