import { describe, expect, it } from 'vitest'
import { arredondarCasas, lerNumero } from '../web/src/lib/numeroBr'

describe('lerNumero (campos numéricos da tela)', () => {
  it('formato brasileiro e com símbolo de moeda', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56)
    expect(lerNumero('R$ 1.234,56')).toBe(1234.56)
    expect(lerNumero('0,5')).toBe(0.5)
  })

  it('com os dois separadores, o último é o decimal', () => {
    expect(lerNumero('1,234.56')).toBe(1234.56)
    expect(lerNumero('1.234.567,89')).toBe(1234567.89)
  })

  it('só ponto: 1 ou 2 casas e parte inteira zero são decimais; 3 dígitos é milhar', () => {
    expect(lerNumero('1.5')).toBe(1.5)
    expect(lerNumero('0.125')).toBe(0.125)
    expect(lerNumero('1.000')).toBe(1000)
    expect(lerNumero('1.234.567')).toBe(1234567)
  })

  it('preço do litro aceita 3 casas com ponto; campo de dinheiro comum lê como milhar', () => {
    expect(lerNumero('5.899', { tresCasas: true })).toBe(5.899)
    expect(lerNumero('5,899', { tresCasas: true })).toBe(5.899)
    expect(lerNumero('5.899')).toBe(5899)
    expect(lerNumero('12.345', { tresCasas: true })).toBe(12345)
  })

  it('vazio vira null; negativo vira zero', () => {
    expect(lerNumero('')).toBeNull()
    expect(lerNumero('R$ ')).toBeNull()
    expect(lerNumero('-3')).toBe(0)
  })

  it('arredonda para o número de casas do campo', () => {
    expect(arredondarCasas(0.125, 2)).toBe(0.13)
    expect(arredondarCasas(5.8994, 3)).toBe(5.899)
  })
})
