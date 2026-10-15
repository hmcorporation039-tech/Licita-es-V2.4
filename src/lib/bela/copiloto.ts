export type Faixa = 'verde' | 'amarela' | 'vermelha'

export interface LimitesDoAlvo {
  custoComRateio: number
  impostosPct: number
  margemDesejadaPct: number
}

export interface RegrasDoPregao {
  decrementoPct: number
  maxLances: number
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

export function limitesDoAlvo(l: LimitesDoAlvo): { minimoComMargem: number | null; equilibrio: number | null } {
  const imp = l.impostosPct / 100
  const mar = l.margemDesejadaPct / 100
  if (l.custoComRateio <= 0) return { minimoComMargem: null, equilibrio: null }
  return {
    minimoComMargem: 1 - imp - mar > 0 ? arred(l.custoComRateio / (1 - imp - mar)) : null,
    equilibrio: 1 - imp > 0 ? arred(l.custoComRateio / (1 - imp)) : null,
  }
}

function resultadoEm(valor: number, l: LimitesDoAlvo): { lucro: number; margemPct: number } {
  const lucro = arred(valor - l.custoComRateio - valor * (l.impostosPct / 100))
  return { lucro, margemPct: valor > 0 ? Math.round((lucro / valor) * 1000) / 10 : 0 }
}

export function avaliarLance(valor: number, l: LimitesDoAlvo, regras: RegrasDoPregao, meusLances: number): Avaliacao {
  const { minimoComMargem, equilibrio } = limitesDoAlvo(l)
  const { lucro, margemPct } = resultadoEm(valor, l)
  const faixa: Faixa = equilibrio !== null && valor < equilibrio ? 'vermelha' : minimoComMargem !== null && valor < minimoComMargem ? 'amarela' : 'verde'
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
    const cobrir = Math.floor(valor * (1 - regras.decrementoPct / 100) * 100) / 100
    if (cobrir >= minimoComMargem) {
      sugestao = { valor: cobrir, margemPct: resultadoEm(cobrir, l).margemPct, ultimo: lancesRestantes === 1 }
      frases.push(`Sugiro cobrir com ${reais(cobrir)}, margem de ${pct(sugestao.margemPct)}.`)
    } else if (valor > minimoComMargem) {
      sugestao = { valor: minimoComMargem, margemPct: resultadoEm(minimoComMargem, l).margemPct, ultimo: true }
      frases.push(`Seu limite é ${reais(minimoComMargem)}. Dá para um último lance nesse valor.`)
    } else {
      frases.push(`Abaixo do seu limite de ${reais(minimoComMargem)}. Recomendo não cobrir.`)
    }
  }
  if (sugestao && lancesRestantes === 1 && !frases.some((f) => f.includes('último'))) frases.push('Seria o seu último lance.')

  return { valor, lucro, margemPct, faixa, minimoComMargem, equilibrio, sugestao, lancesRestantes, mensagem: frases.join(' ') }
}
