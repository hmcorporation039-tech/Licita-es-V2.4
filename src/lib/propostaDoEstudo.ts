// ============================================================
// lib/propostaDoEstudo.ts — A proposta que vai para o portal, tirada do estudo
// de custos: número do item, quantidade e o preço unitário de venda que a
// pessoa definiu. Item sem preço fica de fora (e é listado para ela ver).
// ============================================================

import type { DadosDoEstudo, ItemDaLicitacao } from './estudoDeCustos'

export interface ItemDaProposta {
  numero: number | null
  descricao: string
  unidade: string | null
  quantidade: number
  precoUnitario: number
  total: number
  marcaModelo: string | null
  /** Valor unitário estimado pelo órgão, quando o edital informa. */
  estimadoUnitario: number | null
}

export interface PropostaDoEstudo {
  itens: ItemDaProposta[]
  semPreco: { numero: number | null; descricao: string }[]
  /** Itens com preço acima do estimado pelo órgão: proposta assim costuma ser desclassificada. */
  acimaDoEstimado: { numero: number | null; descricao: string; precoUnitario: number; estimadoUnitario: number }[]
  total: number
  continuo: boolean
}

const centavos = (v: number) => Math.round(v * 100) / 100

export function montarProposta(itens: ItemDaLicitacao[], dados: DadosDoEstudo): PropostaDoEstudo {
  const proposta: ItemDaProposta[] = []
  const semPreco: { numero: number | null; descricao: string }[] = []
  for (const it of itens) {
    const preco = dados.itens[it.id]?.precoVendaUnit
    if (preco === null || preco === undefined || !(preco > 0)) {
      semPreco.push({ numero: it.numero, descricao: it.descricao })
      continue
    }
    // O portal multiplica o preço unitário já arredondado: o total segue a mesma conta.
    const unitario = centavos(preco)
    proposta.push({
      numero: it.numero,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      precoUnitario: unitario,
      total: centavos(unitario * it.quantidade),
      marcaModelo: dados.itens[it.id]?.marcaModelo?.trim() || null,
      estimadoUnitario: it.valorEstimadoUnit !== null && it.valorEstimadoUnit > 0 ? it.valorEstimadoUnit : null,
    })
  }
  const acimaDoEstimado = proposta.flatMap((i) =>
    i.estimadoUnitario !== null && i.precoUnitario > centavos(i.estimadoUnitario)
      ? [{ numero: i.numero, descricao: i.descricao, precoUnitario: i.precoUnitario, estimadoUnitario: i.estimadoUnitario }]
      : [],
  )
  return {
    itens: proposta,
    semPreco,
    acimaDoEstimado,
    total: centavos(proposta.reduce((s, i) => s + i.total, 0)),
    continuo: dados.contrato?.tipo === 'continuo',
  }
}

// Texto para colar numa planilha ou no portal: uma linha por item, separado por tabulação.
export function propostaEmTexto(p: PropostaDoEstudo): string {
  const br = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const comMarca = p.itens.some((i) => i.marcaModelo)
  const linhas = p.itens.map((i) =>
    [i.numero ?? '', i.descricao.replace(/\s+/g, ' ').slice(0, 200), ...(comMarca ? [i.marcaModelo ?? ''] : []), i.unidade ?? '', i.quantidade, br(i.precoUnitario), br(i.total)].join('\t'),
  )
  return [['Item', 'Descrição', ...(comMarca ? ['Marca/modelo'] : []), 'Unidade', 'Quantidade', 'Preço unitário', 'Total'].join('\t'), ...linhas].join('\n')
}
