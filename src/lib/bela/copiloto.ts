import { precoMinimoComMargem } from '../estudoDeCustos'

export type Faixa = 'verde' | 'amarela' | 'vermelha'

export interface LimitesDoAlvo {
  custoComRateio: number
  impostosPct: number
  margemDesejadaPct: number
  minimoComMargem?: number | null
}

export interface RegrasDoPregao {
  decrementoPct: number
  maxLances: number
  intervaloMinimoReais?: number | null
}

export interface Avaliacao {
  valor: number
  lucro: number
  margemPct: number
  faixa: Faixa
  minimoComMargem: number | null
  equilibrio: number | null
  sugestao: { valor: number; margemPct: number; ultimo: boolean } | null
  lancesRestantes: number
  mensagem: string
}

const arred = (n: number) => Math.round(n * 100) / 100
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export function proximoLance(valor: number, regras: RegrasDoPregao): number {
  const pelaPorcentagem = Math.floor(valor * (1 - regras.decrementoPct / 100) * 100 + 1e-6) / 100
  return regras.intervaloMinimoReais ? Math.min(pelaPorcentagem, arred(valor - regras.intervaloMinimoReais)) : pelaPorcentagem
}

function passoDescrito(regras: RegrasDoPregao): string {
  return regras.intervaloMinimoReais ? `${pct(regras.decrementoPct)} (e pelo menos ${reais(regras.intervaloMinimoReais)})` : pct(regras.decrementoPct)
}

export function limitesDoAlvo(l: LimitesDoAlvo): { minimoComMargem: number | null; equilibrio: number | null } {
  const imp = l.impostosPct / 100
  if (l.custoComRateio <= 0) return { minimoComMargem: null, equilibrio: null }
  return {
    minimoComMargem: l.minimoComMargem !== undefined ? l.minimoComMargem : precoMinimoComMargem(l.custoComRateio, l.impostosPct, l.margemDesejadaPct),
    equilibrio: 1 - imp > 0 ? arred(l.custoComRateio / (1 - imp)) : null,
  }
}

function resultadoEm(valor: number, l: LimitesDoAlvo): { lucro: number; margemPct: number } {
  const lucro = arred(valor - l.custoComRateio - valor * (l.impostosPct / 100))
  return { lucro, margemPct: valor > 0 ? Math.round((lucro / valor) * 1000) / 10 : 0 }
}

function faixaDe(valor: number, minimoComMargem: number | null, equilibrio: number | null): Faixa {
  if (equilibrio !== null && valor < equilibrio) return 'vermelha'
  if (minimoComMargem !== null && valor < minimoComMargem) return 'amarela'
  return 'verde'
}

export function avaliarLance(valor: number, l: LimitesDoAlvo, regras: RegrasDoPregao, meusLances: number, meuMenorLance: number | null = null): Avaliacao {
  if (meuMenorLance !== null && meuMenorLance < valor) {
    const meu = avaliarMeuLance(meuMenorLance, l, regras, meusLances)
    return {
      ...meu,
      mensagem: `Melhor lance informado: ${reais(valor)}. Seu lance de ${reais(meuMenorLance)} é menor: você continua na frente, não precisa cobrir.${l.custoComRateio > 0 ? ` Sua margem está em ${pct(meu.margemPct)}.` : ''}`,
    }
  }
  const { minimoComMargem, equilibrio } = limitesDoAlvo(l)
  const { lucro, margemPct } = resultadoEm(valor, l)
  const faixa = faixaDe(valor, minimoComMargem, equilibrio)
  const lancesRestantes = Math.max(0, regras.maxLances - meusLances)

  const frases = [`Melhor lance em ${reais(valor)}.`]
  if (l.custoComRateio <= 0) {
    frases.push('Preencha os custos no estudo de custos para eu calcular sua margem.')
    return { valor, lucro, margemPct, faixa: 'verde', minimoComMargem, equilibrio, sugestao: null, lancesRestantes, mensagem: frases.join(' ') }
  }

  if (faixa === 'vermelha') frases.push(`Nesse valor você teria prejuízo de ${reais(-lucro)}. Não cubra.`)
  else frases.push(`Nesse valor sua margem seria de ${pct(margemPct)}.`)

  let sugestao: Avaliacao['sugestao'] = null
  if (lancesRestantes === 0) {
    frases.push(`Você já deu ${regras.maxLances} ${regras.maxLances === 1 ? 'lance' : 'lances'}, o limite combinado. Recomendo parar aqui.`)
  } else if (minimoComMargem !== null && faixa !== 'vermelha') {
    const cobrir = proximoLance(valor, regras)
    if (cobrir >= minimoComMargem) {
      sugestao = { valor: cobrir, margemPct: resultadoEm(cobrir, l).margemPct, ultimo: lancesRestantes === 1 }
      frases.push(`Sugiro cobrir com ${reais(cobrir)}, margem de ${pct(sugestao.margemPct)}.`)
    } else if (valor > minimoComMargem) {
      frases.push(`Seu limite de ${reais(minimoComMargem)} fica a menos de ${passoDescrito(regras)} do melhor lance: o próximo lance teria de ser de no máximo ${reais(cobrir)} e não cabe no intervalo mínimo exigido. Recomendo não cobrir.`)
    } else if (valor === minimoComMargem) {
      frases.push(`O melhor lance já está no seu limite de ${reais(minimoComMargem)}. Recomendo não cobrir.`)
    } else {
      frases.push(`Abaixo do seu limite de ${reais(minimoComMargem)}. Recomendo não cobrir.`)
    }
  }
  if (sugestao && lancesRestantes === 1 && !frases.some((f) => f.includes('último'))) frases.push('Seria o seu último lance.')

  return { valor, lucro, margemPct, faixa, minimoComMargem, equilibrio, sugestao, lancesRestantes, mensagem: frases.join(' ') }
}

export function avaliarMeuLance(valor: number, l: LimitesDoAlvo, regras: RegrasDoPregao, meusLances: number): Avaliacao {
  const { minimoComMargem, equilibrio } = limitesDoAlvo(l)
  const { lucro, margemPct } = resultadoEm(valor, l)
  const faixa = faixaDe(valor, minimoComMargem, equilibrio)
  const lancesRestantes = Math.max(0, regras.maxLances - meusLances)
  const frases = [`Seu lance de ${reais(valor)} foi registrado.`]
  if (l.custoComRateio > 0) frases.push(faixa === 'vermelha' ? `Atenção: nesse valor há prejuízo de ${reais(-lucro)}.` : `Margem de ${pct(margemPct)}.`)
  frases.push(lancesRestantes === 0 ? 'Era o seu último lance combinado.' : `${lancesRestantes === 1 ? 'Resta 1 lance' : `Restam ${lancesRestantes} lances`}. Me diga o próximo melhor lance quando ele aparecer.`)
  return { valor, lucro, margemPct, faixa: l.custoComRateio > 0 ? faixa : 'verde', minimoComMargem, equilibrio, sugestao: null, lancesRestantes, mensagem: frases.join(' ') }
}

