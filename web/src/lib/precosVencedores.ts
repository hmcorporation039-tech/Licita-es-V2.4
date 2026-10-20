import { formatarPercentual, formatarReais } from './resultadoDaLicitacao'

export const MINIMO_DE_CASOS = 3

export type CriterioDeSemelhanca = 'codigo' | 'descricao'

export interface EstatisticasDosVencedores {
  amostras: number
  descartados: number
  minimo: number
  p25: number
  mediana: number
  p75: number
  maximo: number
  media: number
}

export interface CasoRecenteVencedor {
  orgao: string | null
  municipio: string | null
  uf: string | null
  dataDoResultado: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  precoVencedor: number
  precoEstimado: number | null
  vencedorNome: string | null
  vencedorPorte: string | null
}

export interface FornecedorQueMaisVence {
  nome: string | null
  porte: string | null
  documento: string | null
  vitorias: number
}

export interface PrecosVencedoresDoItem {
  itemId: string
  criterio: CriterioDeSemelhanca | null
  amostras: number
  estatisticas: EstatisticasDosVencedores | null
  unidade: string | null
  unidadeConfere: boolean | null
  descontoMedianoPct: number | null
  recentes: CasoRecenteVencedor[]
  quemMaisVence: FornecedorQueMaisVence[]
}

export interface PrecosVencedoresResposta {
  meses: number
  minimoDeCasos: number
  itens: PrecosVencedoresDoItem[]
}

export const TEXTO_DA_BASE =
  'Resultado de licitações do PNCP acompanhadas pela Licita Bela. A base cresce com o tempo. É só referência: nada muda no seu preço sem você clicar.'

export function textoDoCriterio(criterio: CriterioDeSemelhanca | null, tipo: 'MATERIAL' | 'SERVICO' | null): string {
  if (criterio === 'codigo') return tipo === 'SERVICO' ? 'mesmo código CATSER' : 'mesmo código CATMAT'
  if (criterio === 'descricao') return 'descrição parecida'
  return 'sem casos'
}

export function textoDosCasos(quantidade: number): string {
  return quantidade === 1 ? '1 caso' : `${quantidade} casos`
}

export function textoDoDesconto(descontoPct: number): string {
  if (Math.abs(descontoPct) < 0.05) return 'igual ao estimado'
  return `${formatarPercentual(descontoPct)} ${descontoPct > 0 ? 'abaixo' : 'acima'} do estimado`
}

export function porUnidade(unidade: string | null): string {
  return `/${(unidade ?? 'un').toLowerCase()}`
}

export interface ReferenciaDoPregao {
  mediana: number
  unidade: string | null
  casos: number
  descontoMedianoPct: number | null
}

export function referenciaParaOPregao(item: PrecosVencedoresDoItem | undefined): ReferenciaDoPregao | null {
  if (!item || !item.estatisticas || item.amostras < MINIMO_DE_CASOS || item.unidadeConfere !== true) return null
  return { mediana: item.estatisticas.mediana, unidade: item.unidade, casos: item.amostras, descontoMedianoPct: item.descontoMedianoPct }
}

export function textoDaReferencia(ref: ReferenciaDoPregao): string {
  const partes = [`Vencedores parecidos: mediana ${formatarReais(ref.mediana)}${porUnidade(ref.unidade)}`, textoDosCasos(ref.casos)]
  if (ref.descontoMedianoPct !== null) partes.push(`mediana ${textoDoDesconto(ref.descontoMedianoPct)}`)
  return partes.join(' · ')
}

export function acimaDoQueCostumaVencer(
  alvo: { precoProposto: number | null; minimoComMargem: number | null; quantidade: number },
  criterio: 'UNITARIO' | 'TOTAL_DO_ITEM',
  ref: ReferenciaDoPregao,
): boolean {
  if (alvo.precoProposto === null) return false
  if (alvo.minimoComMargem !== null && alvo.precoProposto < alvo.minimoComMargem) return false
  const quantidade = alvo.quantidade > 0 ? alvo.quantidade : 1
  const unitario = criterio === 'TOTAL_DO_ITEM' ? alvo.precoProposto / quantidade : alvo.precoProposto
  return unitario > ref.mediana
}
