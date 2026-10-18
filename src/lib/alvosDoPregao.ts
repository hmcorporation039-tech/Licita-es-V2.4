import type { DadosDoEstudo, ItemDaLicitacao, ResultadoDoEstudo } from './estudoDeCustos'
import type { LimitesDoAlvo } from './bela/copiloto'

export const ALVO_GLOBAL = 'global'

export type CriterioDoPregao = 'UNITARIO' | 'TOTAL_DO_ITEM'

export interface AlvoDoPregao {
  id: string
  rotulo: string
  numero: number | null
  quantidade: number
  precoProposto: number | null
  limites: LimitesDoAlvo
}

const arred = (n: number) => Math.round(n * 100) / 100

export function alvosDoPregao(itens: ItemDaLicitacao[], dados: DadosDoEstudo, resultado: ResultadoDoEstudo, criterio: CriterioDoPregao): AlvoDoPregao[] {
  const base = resultado.custoItens + resultado.custoDeslocamento + resultado.custoOutros
  const rateio = resultado.custoItens > 0 ? 1 + (resultado.custoDeslocamento + resultado.custoOutros) / resultado.custoItens : 1
  const comum = { impostosPct: dados.impostosPct, margemDesejadaPct: dados.margemDesejadaPct }
  const porTotal = criterio === 'TOTAL_DO_ITEM'
  const minimoUnitDoEstudo = new Map(resultado.itens.map((l) => [l.id, l.precoMinimoUnit]))

  return [
    {
      id: ALVO_GLOBAL,
      rotulo: 'Valor global',
      numero: null,
      quantidade: 1,
      precoProposto: resultado.receita > 0 ? resultado.receita : null,
      limites: { custoComRateio: base, ...comum, minimoComMargem: base > 0 ? resultado.receitaMinima : null },
    },
    ...itens.map((it) => {
      const custoUnit = dados.itens[it.id]?.custoUnit ?? 0
      const venda = dados.itens[it.id]?.precoVendaUnit ?? null
      const fator = porTotal ? it.quantidade : 1
      const minimoUnit = minimoUnitDoEstudo.get(it.id) ?? null
      return {
        id: it.id,
        rotulo: `Item ${it.numero ?? '?'}: ${it.descricao.slice(0, 90)}`,
        numero: it.numero,
        quantidade: it.quantidade,
        precoProposto: venda === null ? null : arred(venda * fator),
        limites: { custoComRateio: custoUnit * rateio * fator, ...comum, minimoComMargem: minimoUnit === null ? null : arred(minimoUnit * fator) },
      }
    }),
  ]
}
