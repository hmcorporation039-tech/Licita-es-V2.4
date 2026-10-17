const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

const ESCALAS: Array<[string, string]> = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
]

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto])
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
    }
  }
  return partes.join(' e ')
}

export function inteiroPorExtenso(n: number): string {
  const inteiro = Math.floor(Math.abs(n))
  if (inteiro === 0) return 'zero'
  const grupos: number[] = []
  let resto = inteiro
  while (resto > 0) {
    grupos.push(resto % 1000)
    resto = Math.floor(resto / 1000)
  }
  if (grupos.length > ESCALAS.length) return inteiro.toLocaleString('pt-BR')

  const partes: Array<{ texto: string; valor: number; indice: number }> = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (g === 0) continue
    let t = ate999(g)
    if (i === 1) t = g === 1 ? 'mil' : `${t} mil`
    else if (i > 1) t = `${t} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`
    partes.push({ texto: t, valor: g, indice: i })
  }

  return partes
    .map((p, idx) => {
      if (idx === 0) return p.texto
      const ultimo = idx === partes.length - 1
      const usaE = ultimo && (p.valor < 100 || p.valor % 100 === 0)
      return usaE ? `e ${p.texto}` : p.texto
    })
    .join(' ')
}

export function reaisPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(centavosTotais / 100)
  const centavos = centavosTotais % 100
  const partes: string[] = []
  if (reais > 0) {
    const grupoBaixo = reais % 1_000_000
    const deMilhao = reais >= 1_000_000 && grupoBaixo === 0
    partes.push(`${inteiroPorExtenso(reais)} ${deMilhao ? 'de ' : ''}${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  if (partes.length === 0) return 'zero real'
  return partes.join(' e ')
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
