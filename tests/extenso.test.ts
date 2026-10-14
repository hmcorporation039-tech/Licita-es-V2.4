import { describe, expect, it } from 'vitest'
import { inteiroPorExtenso, reaisPorExtenso } from '../src/lib/documentosDaLicitacao/extenso'

describe('valor por extenso', () => {
  it('inteiros', () => {
    expect(inteiroPorExtenso(1)).toBe('um')
    expect(inteiroPorExtenso(21)).toBe('vinte e um')
    expect(inteiroPorExtenso(100)).toBe('cem')
    expect(inteiroPorExtenso(101)).toBe('cento e um')
    expect(inteiroPorExtenso(1000)).toBe('mil')
    expect(inteiroPorExtenso(1001)).toBe('mil e um')
    expect(inteiroPorExtenso(1100)).toBe('mil e cem')
    expect(inteiroPorExtenso(1250)).toBe('mil, duzentos e cinquenta')
    expect(inteiroPorExtenso(2000000)).toBe('dois milhões')
    expect(inteiroPorExtenso(3131853)).toBe('três milhões, cento e trinta e um mil, oitocentos e cinquenta e três')
  })

  it('reais e centavos', () => {
    expect(reaisPorExtenso(1)).toBe('um real')
    expect(reaisPorExtenso(2.5)).toBe('dois reais e cinquenta centavos')
    expect(reaisPorExtenso(0.01)).toBe('um centavo')
    expect(reaisPorExtenso(1250.75)).toBe('mil, duzentos e cinquenta reais e setenta e cinco centavos')
    expect(reaisPorExtenso(1_000_000)).toBe('um milhão de reais')
    expect(reaisPorExtenso(1_500_000)).toBe('um milhão e quinhentos mil reais')
    expect(reaisPorExtenso(234464)).toBe('duzentos e trinta e quatro mil, quatrocentos e sessenta e quatro reais')
  })
})
