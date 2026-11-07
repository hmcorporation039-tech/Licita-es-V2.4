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
}

export interface PropostaDoEstudo {
  itens: ItemDaProposta[]
  semPreco: { numero: number | null; descricao: string }[]
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
    })
  }
  return {
    itens: proposta,
    semPreco,
    total: centavos(proposta.reduce((s, i) => s + i.total, 0)),
    continuo: dados.contrato?.tipo === 'continuo',
  }
}

// Texto para colar numa planilha ou no portal: uma linha por item, separado por tabulação.
export function propostaEmTexto(p: PropostaDoEstudo): string {
  const br = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const linhas = p.itens.map((i) => [i.numero ?? '', i.descricao.replace(/\s+/g, ' ').slice(0, 200), i.unidade ?? '', i.quantidade, br(i.precoUnitario), br(i.total)].join('\t'))
  return ['Item\tDescrição\tUnidade\tQuantidade\tPreço unitário\tTotal', ...linhas].join('\n')
}
