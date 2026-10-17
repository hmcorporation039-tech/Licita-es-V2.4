export function lerNumero(texto: string, opcoes: { tresCasas?: boolean } = {}): number | null {
  const negativo = /^\s*(?:R\$\s*)?-/.test(texto)
  let t = texto.replace(/[^0-9.,]/g, '')
  if (t === '' || !/\d/.test(t)) return null
  const ultimaVirgula = t.lastIndexOf(',')
  const ultimoPonto = t.lastIndexOf('.')
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? ',' : '.'
    const milhar = decimal === ',' ? '.' : ','
    t = t.split(milhar).join('')
    const posicao = t.lastIndexOf(decimal)
    t = t.slice(0, posicao).split(decimal).join('') + '.' + t.slice(posicao + 1)
  } else if (ultimaVirgula >= 0) {
    const partes = t.split(',')
    t = partes.length === 2 ? `${partes[0]}.${partes[1]}` : partes.join('')
  } else if (ultimoPonto >= 0) {
    const partes = t.split('.')
    if (partes.length !== 2) t = partes.join('')
    else {
      const [inteiro, fracao] = partes
      const decimal =
        inteiro === '0' || inteiro === '' || fracao.length <= 2 || fracao.length > 3 || (fracao.length === 3 && inteiro.length === 1 && opcoes.tresCasas === true)
      t = decimal ? `${inteiro || '0'}.${fracao}` : `${inteiro}${fracao}`
    }
  }
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negativo ? 0 : n
}

export function arredondarCasas(valor: number, casas: number): number {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}
