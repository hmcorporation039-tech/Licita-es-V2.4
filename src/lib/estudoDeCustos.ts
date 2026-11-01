// ============================================================
// lib/estudoDeCustos.ts — Cálculo do estudo de custos da licitação escolhida:
// custos, deslocamento, prazo, lucro ou prejuízo e preço mínimo.
// Sem rede e sem banco. Quem grava e consulta é routes/estudos.ts.
//
// O que o usuário digita (`DadosDoEstudo`) é gravado; o resultado é SEMPRE recalculado.
// É apoio à decisão: estimativas (distância em linha reta, preços de mercado) não são garantia.
// ============================================================

import { Dia, somarDias, somarDiasUteis } from './diasUteis'
import { emDias } from './plural'

// A estrada é mais longa que a linha reta; 1,3 é uma correção usual para rodovias brasileiras.
export const FATOR_ESTRADA = 1.3
// Quanto se percorre por dia de transporte rodoviário (estimativa).
export const KM_POR_DIA = 500
// Folga (em dias) abaixo da qual o prazo é considerado apertado.
export const FOLGA_APERTADA_DIAS = 2
export const LIMITE_DE_CUSTO_POR_KM_PLAUSIVEL = 3

export interface ItemDaLicitacao {
  id: string
  numero: number | null
  descricao: string
  unidade: string | null
  quantidade: number
  valorEstimadoUnit: number | null
  /** Mediana de mercado (preços pagos pelo governo), quando pesquisada. */
  medianaDeMercado?: number | null
  quantidadeAssumida?: boolean
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
  unidade?: string | null
  unidadeConfere?: boolean | null
}

/** De onde veio o custo do item: cotação e base de preços são firmes; mercado é referência; estimativa é chute. */
export type FonteDoCusto = 'COTACAO' | 'BASE' | 'MERCADO' | 'ESTIMATIVA'
export const FONTES_DO_CUSTO: readonly FonteDoCusto[] = ['COTACAO', 'BASE', 'MERCADO', 'ESTIMATIVA']

/**
 * Compra única (entrega/obra) ou serviço contínuo (aluguel, manutenção, limpeza…).
 * No contínuo, custo e preço dos itens são POR MÊS e o resultado vale para os meses faturados.
 */
export interface ContratoDoEstudo {
  tipo: 'unico' | 'continuo'
  vigenciaMeses: number
  /** Meses da vigência sem faturar (mobilização, implantação). */
  mesesSemFaturar: number
}

export const CONTRATO_PADRAO: ContratoDoEstudo = { tipo: 'unico', vigenciaMeses: 12, mesesSemFaturar: 0 }

/** Outro custo: único (uma vez no contrato) ou mensal (só no serviço contínuo). */
export interface OutroCusto {
  descricao: string
  valor: number
  tipo?: 'unico' | 'mensal'
}

export interface DadosDoEstudo {
  versao: 1
  itens: Record<string, { custoUnit: number | null; precoVendaUnit: number | null; fonteDoCusto?: FonteDoCusto | null }>
  mercado: Record<string, MercadoDoItem>
  deslocamento: {
    /** Distância de ida informada à mão; vazio = estimar pela base da empresa. */
    kmIdaInformado: number | null
    viagens: number
    valorPorKm: number
    precoLitro: number
    consumoKmPorLitro: number
    pedagioPorViagem: number
    hospedagemPorViagem: number
  }
  impostosPct: number
  margemDesejadaPct: number
  outrosCustos: OutroCusto[]
  /** Ausente nos estudos antigos = compra única. */
  contrato?: ContratoDoEstudo
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
    deslocamento: { kmIdaInformado: null, viagens: 1, valorPorKm: 0, precoLitro: 0, consumoKmPorLitro: 0, pedagioPorViagem: 0, hospedagemPorViagem: 0 },
    impostosPct: 0,
    margemDesejadaPct: 10,
    outrosCustos: [],
    contrato: { ...CONTRATO_PADRAO },
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
  /** Lucro do item com a sua parte do deslocamento e dos outros custos (null sem custo ou sem preço). */
  lucro: number | null
  margemPct: number | null
  prejuizo: boolean
}

export interface ResumoDoContrato {
  vigenciaMeses: number
  mesesFaturados: number
  receitaMensal: number
  /** Itens + outros custos mensais. */
  custoMensal: number
  impostosMensais: number
  lucroMensal: number
  /** Custos únicos + deslocamento: saem uma vez no contrato. */
  custosUnicos: number
  custosUnicosPorMes: number | null
  /** Meses faturados para o lucro mensal pagar os custos únicos (null se não há lucro mensal). */
  mesesParaRecuperar: number | null
}

export interface TetoDeCusto {
  margemPct: number
  /** Custo total máximo (sem impostos) para ainda ter essa margem. */
  custoMaximo: number
  /** Quanto falta (positivo) ou sobra (negativo) até o teto, comparado aos custos de hoje. */
  folga: number
  /** No serviço contínuo: quanto se pode pagar por mês, já descontados os custos únicos. */
  custoMaximoMensal: number | null
}

export interface LanceComDesconto {
  descontoPct: number
  receita: number
  lucro: number
  margemPct: number | null
}

export interface Negociacao {
  receitaReferencia: number
  origemDaReferencia: 'seus_precos' | 'estimado_orgao'
  custoAtual: number
  /** Custo total que deixa o lucro em zero nessa receita. */
  custoDeEquilibrio: number
  tetos: TetoDeCusto[]
  lances: LanceComDesconto[]
  /** Maior desconto sobre a referência sem dar prejuízo (negativo = já dá prejuízo). */
  descontoMaximoSemPrejuizo: number | null
}

export interface OrigemDosCustos {
  /** Cotação de fornecedor ou base de preços da empresa. */
  firme: number
  /** Preço de mercado (o que o governo pagou). */
  referencia: number
  estimativa: number
  semOrigem: number
  /** Parte do custo dos itens sem cotação nem base (estimativa + sem origem), em %. */
  pctSemCotacao: number | null
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
  custosSemImpostos: number
  custoTotal: number
  lucro: number
  margemPct: number | null
  receitaMinima: number | null
  estimadoPeloOrgao: number | null
  resultadoNoEstimado: number | null
  itens: LinhaDoItem[]
  deslocamento: {
    origem: 'estimado' | 'informado' | 'indisponivel'
    kmIda: number | null
    kmIdaEVolta: number | null
    litrosPorViagem: number | null
    combustivelPorViagem: number
    custoPorViagem: number
  }
  cenarios: Cenario[]
  /** Só no serviço contínuo. */
  contrato: ResumoDoContrato | null
  negociacao: Negociacao | null
  origemDosCustos: OrigemDosCustos
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
const arredParaCima = (n: number) => Math.ceil(Number((n * 100).toFixed(6))) / 100
const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function precoMinimoComMargem(custoComRateio: number, impostosPct: number, margemDesejadaPct: number): number | null {
  const divisor = 1 - impostosPct / 100 - margemDesejadaPct / 100
  return divisor > 0 && custoComRateio > 0 ? arredParaCima(custoComRateio / divisor) : null
}

function margem(lucro: number, receita: number): number | null {
  return receita > 0 ? Math.round((lucro / receita) * 10_000) / 100 : null
}

export function calcularEstudo(itens: ItemDaLicitacao[], dados: DadosDoEstudo, ctx: ContextoDoCalculo): ResultadoDoEstudo {
  const avisos: string[] = []
  const imp = num(dados.impostosPct) / 100
  const mar = num(dados.margemDesejadaPct) / 100

  // ---- Tipo de contrato ----
  // No serviço contínuo, custo e preço dos itens (e os outros custos mensais) são por mês
  // e valem para os meses faturados; custos únicos e deslocamento saem uma vez.
  const contrato = dados.contrato ?? CONTRATO_PADRAO
  const continuo = contrato.tipo === 'continuo'
  const vigenciaMeses = Math.max(0, Math.round(num(contrato.vigenciaMeses)))
  const mesesFaturados = continuo ? Math.max(0, vigenciaMeses - Math.max(0, Math.round(num(contrato.mesesSemFaturar)))) : 1
  if (continuo && mesesFaturados === 0) avisos.push('Nenhum mês faturado: a vigência é menor ou igual aos meses sem faturar.')

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
  const kmIdaEVolta = kmIda !== null ? 2 * kmIda : null
  const consumo = num(d.consumoKmPorLitro)
  const litrosPorViagem = kmIdaEVolta !== null && consumo > 0 ? kmIdaEVolta / consumo : null
  const combustivelPorViagem = litrosPorViagem !== null ? litrosPorViagem * num(d.precoLitro) : 0
  const custoPorViagem = combustivelPorViagem + (kmIdaEVolta !== null ? kmIdaEVolta * num(d.valorPorKm) : 0) + num(d.pedagioPorViagem) + num(d.hospedagemPorViagem)
  const custoDeslocamento = arred(num(d.viagens) * custoPorViagem)
  if (kmIda === null && (num(d.valorPorKm) > 0 || num(d.precoLitro) > 0)) {
    avisos.push('Sem distância: cadastre a base da empresa (Empresa → Base de entregas) ou informe os quilômetros à mão.')
  }
  if (num(d.precoLitro) > 0 && consumo === 0) {
    avisos.push('Informe o consumo do veículo (km por litro) para calcular o combustível.')
  }
  if (num(d.valorPorKm) > LIMITE_DE_CUSTO_POR_KM_PLAUSIVEL) {
    avisos.push(
      `Confira o "outro custo por km": ${num(d.valorPorKm).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por km dá ${(num(d.valorPorKm) * 2 * (kmIda ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por viagem. Se for o preço do litro do combustível, use os campos de combustível.`,
    )
  }

  // ---- Itens ----
  let custoItens = 0
  let receita = 0
  let custoMensalItens = 0
  let receitaMensal = 0
  const origem = { firme: 0, referencia: 0, estimativa: 0, semOrigem: 0 }
  let algumaOrigemMarcada = false
  const linhas: LinhaDoItem[] = itens.map((it) => {
    const e = dados.itens[it.id] ?? { custoUnit: null, precoVendaUnit: null }
    const custoNoPeriodo = it.quantidade * num(e.custoUnit)
    const vendaNoPeriodo = it.quantidade * num(e.precoVendaUnit)
    custoMensalItens += custoNoPeriodo
    receitaMensal += vendaNoPeriodo
    const custo = arred(custoNoPeriodo * mesesFaturados)
    const venda = arred(vendaNoPeriodo * mesesFaturados)
    custoItens += custo
    receita += venda
    if (e.fonteDoCusto) algumaOrigemMarcada = true
    if (e.custoUnit !== null) {
      if (e.fonteDoCusto === 'COTACAO' || e.fonteDoCusto === 'BASE') origem.firme += custo
      else if (e.fonteDoCusto === 'MERCADO') origem.referencia += custo
      else if (e.fonteDoCusto === 'ESTIMATIVA') origem.estimativa += custo
      else origem.semOrigem += custo
    }
    return {
      id: it.id,
      custo,
      venda,
      precoMinimoUnit: null,
      semCusto: e.custoUnit === null,
      semPrecoDeVenda: e.precoVendaUnit === null,
      lucro: null,
      margemPct: null,
      prejuizo: false,
    }
  })
  custoItens = arred(custoItens)
  receita = arred(receita)

  const semCusto = linhas.filter((l) => l.semCusto).length
  const semVenda = linhas.filter((l) => l.semPrecoDeVenda).length
  if (semCusto > 0) avisos.push(`${semCusto} item(ns) sem custo informado: o lucro está superestimado.`)
  if (semVenda > 0 && receita > 0) avisos.push(`${semVenda} item(ns) sem preço de venda: a receita considera só os itens preenchidos.`)
  const semQuantidade = itens.filter((it) => it.quantidadeAssumida).length
  if (semQuantidade > 0) avisos.push(`${semQuantidade} item(ns) sem quantidade no edital: o cálculo considerou 1 unidade. Confira a quantidade antes de ofertar.`)
  const mercadoEmOutraUnidade = itens.filter((it) => dados.mercado[it.id]?.unidadeConfere === false).length
  if (mercadoEmOutraUnidade > 0) {
    avisos.push(`${mercadoEmOutraUnidade} item(ns) com preço de mercado em unidade diferente da pedida na licitação: confira antes de usar como preço.`)
  }

  if (continuo) {
    const emMeses = itens.filter((it) => /^(m[eê]s|meses|mensal)/i.test((it.unidade ?? '').trim()))
    if (emMeses.length > 0) {
      avisos.push(
        `${emMeses.length} item(ns) com a quantidade em meses: no serviço contínuo o cálculo multiplica pela vigência de novo. Se a quantidade do edital já é o número de meses, use "Compra ou entrega única".`,
      )
    }
  }

  // Outros custos: os mensais só existem no serviço contínuo (na compra única contam uma vez).
  const outrosMensais = continuo ? dados.outrosCustos.filter((o) => o.tipo === 'mensal').reduce((s, o) => s + num(o.valor), 0) : 0
  const outrosUnicos = dados.outrosCustos.filter((o) => !continuo || o.tipo !== 'mensal').reduce((s, o) => s + num(o.valor), 0)
  const custoOutros = arred(outrosUnicos + outrosMensais * mesesFaturados)
  const base = custoItens + custoDeslocamento + custoOutros
  const impostos = arred(receita * imp)
  const custoTotal = arred(base + impostos)
  const lucro = arred(receita - custoTotal)

  // ---- Preço mínimo (para a margem desejada) ----
  const divisor = 1 - imp - mar
  let receitaMinima = precoMinimoComMargem(base, num(dados.impostosPct), num(dados.margemDesejadaPct))
  if (divisor <= 0) avisos.push('Impostos + margem desejada somam 100% ou mais: não existe preço que cumpra a margem.')
  if (divisor > 0 && custoItens > 0) {
    // Custos que não são dos itens (deslocamento, outros) são rateados pelo custo de cada item.
    const rateio = 1 + (custoDeslocamento + custoOutros) / custoItens
    itens.forEach((it, i) => {
      const c = dados.itens[it.id]?.custoUnit
      if (c !== null && c !== undefined && c > 0) linhas[i].precoMinimoUnit = precoMinimoComMargem(c * rateio, num(dados.impostosPct), num(dados.margemDesejadaPct))
    })
    const somaDosMinimosUnitarios = arred(itens.reduce((s, it, i) => s + it.quantidade * mesesFaturados * (linhas[i].precoMinimoUnit ?? 0), 0))
    if (receitaMinima !== null && somaDosMinimosUnitarios > receitaMinima) receitaMinima = somaDosMinimosUnitarios
  }

  // ---- Lucro por item ----
  // O total pode dar lucro e um item sozinho dar prejuízo. Deslocamento e outros custos
  // entram na proporção do custo de cada item (o mesmo rateio do preço mínimo).
  const naoDosItens = custoDeslocamento + custoOutros
  const comPrejuizo: string[] = []
  itens.forEach((it, i) => {
    const l = linhas[i]
    if (l.semCusto || l.semPrecoDeVenda || l.venda <= 0) return
    const parteDosOutros = custoItens > 0 ? naoDosItens * (l.custo / custoItens) : 0
    l.lucro = arred(l.venda - l.custo - l.venda * imp - parteDosOutros)
    l.margemPct = margem(l.lucro, l.venda)
    l.prejuizo = l.lucro < 0
    if (l.prejuizo) comPrejuizo.push(it.numero !== null ? `item ${it.numero}` : `"${it.descricao.slice(0, 40)}"`)
  })
  if (comPrejuizo.length > 0) {
    const lista = comPrejuizo.length > 6 ? `${comPrejuizo.slice(0, 6).join(', ')} e mais ${comPrejuizo.length - 6}` : comPrejuizo.join(', ')
    avisos.push(`Dá prejuízo com os seus preços: ${lista}. Confira o custo ou o preço de venda ${comPrejuizo.length === 1 ? 'dele' : 'deles'}.`)
  }

  // ---- Origem dos custos ----
  const pctSemCotacao = custoItens > 0 ? Math.round(((origem.estimativa + origem.semOrigem) / custoItens) * 1000) / 10 : null
  if (algumaOrigemMarcada && pctSemCotacao !== null && pctSemCotacao >= 50) {
    avisos.push(
      `${pctSemCotacao.toLocaleString('pt-BR')}% do custo dos itens não vem de cotação nem da sua base de preços: o lucro pode mudar quando os fornecedores responderem.`,
    )
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
      t += it.quantidade * v * mesesFaturados
    }
    return t
  }
  // No contínuo, o valor da licitação costuma ser o do contrato todo; os itens podem estar por mês ou por ano.
  const estimadoPeloOrgao = continuo
    ? ctx.valorEstimadoTotal ?? somaOuNull((it) => it.valorEstimadoUnit)
    : somaOuNull((it) => it.valorEstimadoUnit) ?? ctx.valorEstimadoTotal
  if (continuo && estimadoPeloOrgao !== null && estimadoPeloOrgao > 0) {
    avisos.push('Serviço contínuo: o valor estimado pelo órgão foi tomado como o total do contrato. Confira no edital se ele é mensal, anual ou da vigência toda.')
  }
  const reaisBr = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (estimadoPeloOrgao !== null && estimadoPeloOrgao > 0) {
    if (receitaMinima !== null && receitaMinima > estimadoPeloOrgao) {
      avisos.push(
        `O preço mínimo para a sua margem (${reaisBr(receitaMinima)}) está acima do valor estimado pelo órgão (${reaisBr(estimadoPeloOrgao)}). Proposta acima do estimado costuma ser desclassificada: reveja custos ou margem.`,
      )
    } else if (receita > estimadoPeloOrgao) {
      avisos.push(`Seu preço de venda (${reaisBr(receita)}) está acima do valor estimado pelo órgão (${reaisBr(estimadoPeloOrgao)}).`)
    }
  }
  const resultadoNoEstimado = estimadoPeloOrgao !== null && estimadoPeloOrgao > 0 ? lucroEm(estimadoPeloOrgao) : null
  add('Com os seus preços de venda', receita > 0 ? receita : null)
  add('No valor estimado pelo órgão', estimadoPeloOrgao)
  add('Na mediana de mercado', somaOuNull((it) => it.medianaDeMercado ?? dados.mercado[it.id]?.mediana ?? null))
  add('No preço mínimo (margem desejada)', receitaMinima)
  if (base === 0) avisos.push('Informe os custos para calcular o lucro: sem custos, qualquer receita parece lucro.')

  // ---- Resumo mensal (serviço contínuo) ----
  let resumoDoContrato: ResumoDoContrato | null = null
  if (continuo) {
    const custoMensal = custoMensalItens + outrosMensais
    const impostosMensais = receitaMensal * imp
    const lucroMensal = receitaMensal - custoMensal - impostosMensais
    const custosUnicos = custoDeslocamento + outrosUnicos
    const mesesParaRecuperar = custosUnicos > 0 && lucroMensal > 0 ? Math.ceil(custosUnicos / lucroMensal) : custosUnicos > 0 ? null : 0
    if (receitaMensal > 0 && mesesParaRecuperar !== null && mesesParaRecuperar > mesesFaturados) {
      avisos.push(`Os custos únicos (${reaisBr(custosUnicos)}) levam ${mesesParaRecuperar} meses para se pagar, mais que os ${mesesFaturados} meses faturados.`)
    }
    resumoDoContrato = {
      vigenciaMeses,
      mesesFaturados,
      receitaMensal: arred(receitaMensal),
      custoMensal: arred(custoMensal),
      impostosMensais: arred(impostosMensais),
      lucroMensal: arred(lucroMensal),
      custosUnicos: arred(custosUnicos),
      custosUnicosPorMes: mesesFaturados > 0 ? arred(custosUnicos / mesesFaturados) : null,
      mesesParaRecuperar,
    }
  }

  // ---- Negociação: até quanto pagar e até quanto baixar o lance ----
  const negociacao = montarNegociacao({
    receita,
    estimadoPeloOrgao,
    base,
    imp,
    margemDesejadaPct: num(dados.margemDesejadaPct),
    mesesFaturados: continuo ? mesesFaturados : null,
    custosUnicos: continuo ? custoDeslocamento + outrosUnicos : 0,
  })

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
    if (situacao === 'inviavel') avisos.push(`Prazo inviável: você precisa de ${emDias(diasNecessarios)} e o edital dá ${emDias(p.exigidoDias)}.`)
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
    custosSemImpostos: arred(base),
    custoTotal,
    lucro,
    margemPct: margem(lucro, receita),
    receitaMinima,
    estimadoPeloOrgao: estimadoPeloOrgao !== null ? arred(estimadoPeloOrgao) : null,
    resultadoNoEstimado,
    itens: linhas,
    deslocamento: {
      origem: origemKm,
      kmIda,
      kmIdaEVolta,
      litrosPorViagem: litrosPorViagem !== null ? Math.round(litrosPorViagem * 10) / 10 : null,
      combustivelPorViagem: arred(combustivelPorViagem),
      custoPorViagem: arred(custoPorViagem),
    },
    cenarios,
    contrato: resumoDoContrato,
    negociacao,
    origemDosCustos: {
      firme: arred(origem.firme),
      referencia: arred(origem.referencia),
      estimativa: arred(origem.estimativa),
      semOrigem: arred(origem.semOrigem),
      pctSemCotacao,
    },
    prazo: { situacao, diasNecessarios, diasDeTransporte, folgaDias, dataLimite, dataEntregaPrevista },
    avisos,
  }
}

export const MARGENS_DO_TETO = [10, 15, 20, 25, 30] as const
export const DESCONTOS_DO_LANCE = [0, 5, 10, 15, 20, 25, 30] as const

// Tabela de negociação sobre uma receita de referência (seus preços ou, sem eles, o estimado do órgão):
// o custo máximo para cada margem e o lucro se o lance cair X%.
export function montarNegociacao(e: {
  receita: number
  estimadoPeloOrgao: number | null
  base: number
  imp: number
  margemDesejadaPct: number
  mesesFaturados: number | null
  custosUnicos: number
}): Negociacao | null {
  const origemDaReferencia = e.receita > 0 ? 'seus_precos' : e.estimadoPeloOrgao !== null && e.estimadoPeloOrgao > 0 ? 'estimado_orgao' : null
  if (origemDaReferencia === null) return null
  const ref = origemDaReferencia === 'seus_precos' ? e.receita : (e.estimadoPeloOrgao as number)
  const margens = [...new Set([...MARGENS_DO_TETO, e.margemDesejadaPct].filter((m) => m > 0 && m < 100))].sort((a, b) => a - b)
  const tetos: TetoDeCusto[] = []
  for (const m of margens) {
    const fator = 1 - e.imp - m / 100
    if (fator <= 0) continue
    const custoMaximo = arred(ref * fator)
    tetos.push({
      margemPct: m,
      custoMaximo,
      folga: arred(custoMaximo - e.base),
      custoMaximoMensal: e.mesesFaturados ? arred((custoMaximo - e.custosUnicos) / e.mesesFaturados) : null,
    })
  }
  const lances = DESCONTOS_DO_LANCE.map((d) => {
    const r = ref * (1 - d / 100)
    const lucro = arred(r - e.base - r * e.imp)
    return { descontoPct: d, receita: arred(r), lucro, margemPct: margem(lucro, r) }
  })
  const semPrejuizo = e.imp < 1 ? e.base / (1 - e.imp) : null
  return {
    receitaReferencia: arred(ref),
    origemDaReferencia,
    custoAtual: arred(e.base),
    custoDeEquilibrio: arred(ref * (1 - e.imp)),
    tetos,
    lances,
    descontoMaximoSemPrejuizo: e.base > 0 && semPrejuizo !== null ? Math.floor((1 - semPrejuizo / ref) * 1000) / 10 : null,
  }
}

// "30 dias", "10 (dez) dias úteis", "2 meses", "45 dias corridos" -> prazo em dias.
// Devolve null se não houver número claro: melhor deixar o usuário digitar do que errar.
export function lerPrazoEmDias(texto: string | null | undefined): { dias: number; uteis: boolean } | null {
  if (!texto) return null
  const t = texto.toLowerCase()
  const emDias = [...t.matchAll(/(\d{1,4})\s*(?:\([^)]*\)\s*)?dias?\b(\s+(?:úteis|uteis|útil|util|corridos?))?/g)]
  if (emDias.length > 0) {
    const valores = new Set(emDias.map((m) => Number(m[1])))
    if (valores.size > 1) return null
    return { dias: Number(emDias[0][1]), uteis: emDias.some((m) => /[uú]t(?:eis|il)/.test(m[2] ?? '')) }
  }
  const emMeses = [...t.matchAll(/(\d{1,3})\s*(?:\([^)]*\)\s*)?(?:meses|mês|mes)(?![a-z])/g)]
  const meses = new Set(emMeses.map((m) => Number(m[1])))
  if (meses.size !== 1) return null
  return { dias: Number(emMeses[0][1]) * 30, uteis: false }
}
