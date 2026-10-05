// ============================================================
// lib/estudoDeCustos.ts — Cálculo do estudo de custos da licitação escolhida:
// custos, deslocamento, prazo, lucro ou prejuízo e preço mínimo.
// Sem rede e sem banco. Quem grava e consulta é routes/estudos.ts.
//
// O que o usuário digita (`DadosDoEstudo`) é gravado; o resultado é SEMPRE recalculado.
// É apoio à decisão: estimativas (distância em linha reta, preços de mercado) não são garantia.
// ============================================================

import { Dia, somarDias, somarDiasUteis } from './diasUteis'

// A estrada é mais longa que a linha reta; 1,3 é uma correção usual para rodovias brasileiras.
export const FATOR_ESTRADA = 1.3
// Quanto se percorre por dia de transporte rodoviário (estimativa).
export const KM_POR_DIA = 500
// Folga (em dias) abaixo da qual o prazo é considerado apertado.
export const FOLGA_APERTADA_DIAS = 2

export interface ItemDaLicitacao {
  id: string
  numero: number | null
  descricao: string
  unidade: string | null
  quantidade: number
  valorEstimadoUnit: number | null
  /** Mediana de mercado (preços pagos pelo governo), quando pesquisada. */
  medianaDeMercado?: number | null
}

/** Foto da pesquisa de preços de mercado de um item (fica registrada com a data da consulta). */
export interface MercadoDoItem {
  mediana: number
  minimo: number
  maximo: number
  amostras: number
  uf: string | null
  meses: number
  consultadoEm: string
}

export interface DadosDoEstudo {
  versao: 1
  itens: Record<string, { custoUnit: number | null; precoVendaUnit: number | null }>
  mercado: Record<string, MercadoDoItem>
  deslocamento: {
    /** Distância de ida informada à mão; vazio = estimar pela base da empresa. */
    kmIdaInformado: number | null
    viagens: number
    valorPorKm: number
    pedagioPorViagem: number
    hospedagemPorViagem: number
  }
  impostosPct: number
  margemDesejadaPct: number
  outrosCustos: { descricao: string; valor: number }[]
  prazo: {
    exigidoDias: number | null
    exigidoEmDiasUteis: boolean
    preparoDias: number
    /** Data prevista de assinatura do contrato/ordem de fornecimento (AAAA-MM-DD). */
    assinatura: string | null
  }
}

export function dadosIniciais(): DadosDoEstudo {
  return {
    versao: 1,
    itens: {},
    mercado: {},
    deslocamento: { kmIdaInformado: null, viagens: 1, valorPorKm: 0, pedagioPorViagem: 0, hospedagemPorViagem: 0 },
    impostosPct: 0,
    margemDesejadaPct: 10,
    outrosCustos: [],
    prazo: { exigidoDias: null, exigidoEmDiasUteis: false, preparoDias: 0, assinatura: null },
  }
}

export interface ContextoDoCalculo {
  /** Distância em linha reta entre a base da empresa e o local de entrega; null se faltar um dos lados. */
  distanciaLinhaRetaKm: number | null
  /** Valor total estimado pelo órgão (usado quando os itens não têm valor unitário). */
  valorEstimadoTotal: number | null
}

export interface LinhaDoItem {
  id: string
  custo: number
  venda: number
  /** Menor preço unitário que ainda dá a margem desejada. */
  precoMinimoUnit: number | null
  semCusto: boolean
  semPrecoDeVenda: boolean
}

export interface Cenario {
  nome: string
  receita: number
  lucro: number
  margemPct: number | null
}

export type SituacaoDoPrazo = 'ok' | 'apertado' | 'inviavel'

export interface ResultadoDoEstudo {
  receita: number
  custoItens: number
  custoDeslocamento: number
  custoOutros: number
  impostos: number
  custoTotal: number
  lucro: number
  margemPct: number | null
  receitaMinima: number | null
  itens: LinhaDoItem[]
  deslocamento: {
    origem: 'estimado' | 'informado' | 'indisponivel'
    kmIda: number | null
    kmIdaEVolta: number | null
    custoPorViagem: number
  }
  cenarios: Cenario[]
  prazo: {
    situacao: SituacaoDoPrazo | null
    diasNecessarios: number
    diasDeTransporte: number
    folgaDias: number | null
    dataLimite: string | null
    dataEntregaPrevista: string | null
  }
  avisos: string[]
}

const arred = (n: number) => Math.round(n * 100) / 100
const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function margem(lucro: number, receita: number): number | null {
  return receita > 0 ? Math.round((lucro / receita) * 10_000) / 100 : null
}

export function calcularEstudo(itens: ItemDaLicitacao[], dados: DadosDoEstudo, ctx: ContextoDoCalculo): ResultadoDoEstudo {
  const avisos: string[] = []
  const imp = num(dados.impostosPct) / 100
  const mar = num(dados.margemDesejadaPct) / 100

  // ---- Deslocamento ----
  const d = dados.deslocamento
  let kmIda: number | null = null
  let origemKm: 'estimado' | 'informado' | 'indisponivel' = 'indisponivel'
  if (d.kmIdaInformado !== null && d.kmIdaInformado >= 0) {
    kmIda = d.kmIdaInformado
    origemKm = 'informado'
  } else if (ctx.distanciaLinhaRetaKm !== null) {
    kmIda = Math.round(ctx.distanciaLinhaRetaKm * FATOR_ESTRADA)
    origemKm = 'estimado'
  }
  const custoPorViagem = (kmIda !== null ? 2 * kmIda * num(d.valorPorKm) : 0) + num(d.pedagioPorViagem) + num(d.hospedagemPorViagem)
  const custoDeslocamento = arred(num(d.viagens) * custoPorViagem)
  if (kmIda === null && num(d.valorPorKm) > 0) {
    avisos.push('Sem distância: cadastre a base da empresa (Empresa → Base de entregas) ou informe os quilômetros à mão.')
  }

  // ---- Itens ----
  let custoItens = 0
  let receita = 0
  const linhas: LinhaDoItem[] = itens.map((it) => {
    const e = dados.itens[it.id] ?? { custoUnit: null, precoVendaUnit: null }
    const custo = arred(it.quantidade * num(e.custoUnit))
    const venda = arred(it.quantidade * num(e.precoVendaUnit))
    custoItens += custo
    receita += venda
    return { id: it.id, custo, venda, precoMinimoUnit: null, semCusto: e.custoUnit === null, semPrecoDeVenda: e.precoVendaUnit === null }
  })
  custoItens = arred(custoItens)
  receita = arred(receita)

  const semCusto = linhas.filter((l) => l.semCusto).length
  const semVenda = linhas.filter((l) => l.semPrecoDeVenda).length
  if (semCusto > 0) avisos.push(`${semCusto} item(ns) sem custo informado: o lucro está superestimado.`)
  if (semVenda > 0 && receita > 0) avisos.push(`${semVenda} item(ns) sem preço de venda: a receita considera só os itens preenchidos.`)

  const custoOutros = arred(dados.outrosCustos.reduce((s, o) => s + num(o.valor), 0))
  const base = custoItens + custoDeslocamento + custoOutros
  const impostos = arred(receita * imp)
  const custoTotal = arred(base + impostos)
  const lucro = arred(receita - custoTotal)

  // ---- Preço mínimo (para a margem desejada) ----
  const divisor = 1 - imp - mar
  const receitaMinima = divisor > 0 && base > 0 ? arred(base / divisor) : null
  if (divisor <= 0) avisos.push('Impostos + margem desejada somam 100% ou mais: não existe preço que cumpra a margem.')
  if (divisor > 0 && custoItens > 0) {
    // Custos que não são dos itens (deslocamento, outros) são rateados pelo custo de cada item.
    const rateio = 1 + (custoDeslocamento + custoOutros) / custoItens
    itens.forEach((it, i) => {
      const c = dados.itens[it.id]?.custoUnit
      if (c !== null && c !== undefined && c > 0) linhas[i].precoMinimoUnit = arred((c * rateio) / divisor)
    })
  }

  // ---- Cenários de lance ----
  const lucroEm = (r: number) => arred(r - base - r * imp)
  const cenarios: Cenario[] = []
  const add = (nome: string, r: number | null) => {
    if (r !== null && r > 0) cenarios.push({ nome, receita: arred(r), lucro: lucroEm(r), margemPct: margem(lucroEm(r), r) })
  }
  const somaOuNull = (f: (it: ItemDaLicitacao) => number | null): number | null => {
    if (itens.length === 0) return null
    let t = 0
    for (const it of itens) {
      const v = f(it)
      if (v === null) return null
      t += it.quantidade * v
    }
    return t
  }
  add('Com os seus preços de venda', receita > 0 ? receita : null)
  add('No valor estimado pelo órgão', somaOuNull((it) => it.valorEstimadoUnit) ?? ctx.valorEstimadoTotal)
  add('Na mediana de mercado', somaOuNull((it) => it.medianaDeMercado ?? dados.mercado[it.id]?.mediana ?? null))
  add('No preço mínimo (margem desejada)', receitaMinima)
  if (base === 0) avisos.push('Informe os custos para calcular o lucro: sem custos, qualquer receita parece lucro.')

  // ---- Prazo ----
  const p = dados.prazo
  const diasDeTransporte = kmIda !== null ? Math.ceil(kmIda / KM_POR_DIA) : 0
  const diasNecessarios = Math.max(0, Math.round(num(p.preparoDias))) + diasDeTransporte
  let situacao: SituacaoDoPrazo | null = null
  let folgaDias: number | null = null
  let dataLimite: string | null = null
  let dataEntregaPrevista: string | null = null
  if (p.exigidoDias !== null && p.exigidoDias >= 0) {
    folgaDias = p.exigidoDias - diasNecessarios
    situacao = folgaDias < 0 ? 'inviavel' : folgaDias <= FOLGA_APERTADA_DIAS ? 'apertado' : 'ok'
    if (situacao === 'inviavel') avisos.push(`Prazo inviável: você precisa de ${diasNecessarios} dia(s) e o edital dá ${p.exigidoDias}.`)
  }
  if (p.assinatura && /^\d{4}-\d{2}-\d{2}$/.test(p.assinatura)) {
    const somar = (dias: number) => (p.exigidoEmDiasUteis ? somarDiasUteis(p.assinatura as Dia, dias) : somarDias(p.assinatura as Dia, dias))
    if (p.exigidoDias !== null) dataLimite = somar(p.exigidoDias)
    dataEntregaPrevista = somar(diasNecessarios)
  }

  return {
    receita,
    custoItens,
    custoDeslocamento,
    custoOutros,
    impostos,
    custoTotal,
    lucro,
    margemPct: margem(lucro, receita),
    receitaMinima,
    itens: linhas,
    deslocamento: { origem: origemKm, kmIda, kmIdaEVolta: kmIda !== null ? kmIda * 2 : null, custoPorViagem: arred(custoPorViagem) },
    cenarios,
    prazo: { situacao, diasNecessarios, diasDeTransporte, folgaDias, dataLimite, dataEntregaPrevista },
    avisos,
  }
}

// "30 dias", "10 (dez) dias úteis", "2 meses", "45 dias corridos" -> prazo em dias.
// Devolve null se não houver número claro: melhor deixar o usuário digitar do que errar.
export function lerPrazoEmDias(texto: string | null | undefined): { dias: number; uteis: boolean } | null {
  if (!texto) return null
  const t = texto.toLowerCase()
  const meses = t.match(/(\d{1,3})\s*(?:\([^)]*\)\s*)?(?:mes|meses|mês)\b/)
  if (meses) return { dias: Number(meses[1]) * 30, uteis: false }
  const dias = t.match(/(\d{1,4})\s*(?:\([^)]*\)\s*)?dias?\b(\s+(?:úteis|uteis|corridos))?/)
  if (!dias) return null
  return { dias: Number(dias[1]), uteis: /[uú]teis/.test(dias[2] ?? '') }
}
