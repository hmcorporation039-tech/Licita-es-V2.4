export type LeituraDeDinheiro = { valido: true; valor: number | null } | { valido: false }

const SO_DIGITOS = /^\d+$/
const MILHARES_COM_PONTO = /^\d{1,3}(\.\d{3})+$/
const CENTAVOS = /^\d{1,2}$/
const PONTO_DECIMAL = /^\d+\.\d{1,2}$/

function lerParteInteira(texto: string): string | null {
  if (SO_DIGITOS.test(texto)) return texto
  if (MILHARES_COM_PONTO.test(texto)) return texto.replace(/\./g, '')
  return null
}

export function lerDinheiroBr(texto: string | null | undefined): LeituraDeDinheiro {
  const limpo = (texto ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (!limpo) return { valido: true, valor: null }

  const partes = limpo.split(',')
  if (partes.length > 2) return { valido: false }

  if (partes.length === 2) {
    const [inteira, centavos] = partes
    const inteiraLida = lerParteInteira(inteira || '0')
    if (inteiraLida === null || !CENTAVOS.test(centavos)) return { valido: false }
    return { valido: true, valor: Number(`${inteiraLida}.${centavos}`) }
  }

  const inteiraLida = lerParteInteira(limpo)
  if (inteiraLida !== null) return { valido: true, valor: Number(inteiraLida) }
  if (PONTO_DECIMAL.test(limpo)) return { valido: true, valor: Number(limpo) }
  return { valido: false }
}

const FORMATO_EM_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const FORMATO_PARA_EDICAO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function paraNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

export function formatarDinheiroBr(valor: string | number | null | undefined): string {
  const numero = paraNumero(valor)
  return numero === null ? '—' : FORMATO_EM_REAIS.format(numero).replace(/\s/g, ' ')
}

export function dinheiroBrParaEdicao(valor: string | number | null | undefined): string {
  const numero = paraNumero(valor)
  return numero === null ? '' : FORMATO_PARA_EDICAO.format(numero)
}

export function faixaDeValorBr(minimo: string | number | null | undefined, maximo: string | number | null | undefined): string | null {
  const min = paraNumero(minimo)
  const max = paraNumero(maximo)
  if (min !== null && max !== null) return `de ${formatarDinheiroBr(min)} a ${formatarDinheiroBr(max)}`
  if (min !== null) return `a partir de ${formatarDinheiroBr(min)}`
  if (max !== null) return `até ${formatarDinheiroBr(max)}`
  return null
}
