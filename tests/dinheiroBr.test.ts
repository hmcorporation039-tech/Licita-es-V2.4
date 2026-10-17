import { describe, expect, it } from 'vitest'
import { dinheiroBrParaEdicao, faixaDeValorBr, formatarDinheiroBr, lerDinheiroBr } from '../web/src/lib/dinheiroBr'

describe('lerDinheiroBr', () => {
  it('ponto é milhar e vírgula é centavo, como se digita no Brasil', () => {
    expect(lerDinheiroBr('500.000')).toEqual({ valido: true, valor: 500000 })
    expect(lerDinheiroBr('500.000,50')).toEqual({ valido: true, valor: 500000.5 })
    expect(lerDinheiroBr('R$ 1.234.567,89')).toEqual({ valido: true, valor: 1234567.89 })
    expect(lerDinheiroBr('1234,5')).toEqual({ valido: true, valor: 1234.5 })
    expect(lerDinheiroBr('500000')).toEqual({ valido: true, valor: 500000 })
    expect(lerDinheiroBr(',50')).toEqual({ valido: true, valor: 0.5 })
  })

  it('aceita ponto como decimal só quando não pode ser milhar', () => {
    expect(lerDinheiroBr('1500.50')).toEqual({ valido: true, valor: 1500.5 })
    expect(lerDinheiroBr('1.5')).toEqual({ valido: true, valor: 1.5 })
  })

  it('vazio é "sem filtro"', () => {
    expect(lerDinheiroBr('')).toEqual({ valido: true, valor: null })
    expect(lerDinheiroBr('   ')).toEqual({ valido: true, valor: null })
    expect(lerDinheiroBr(null)).toEqual({ valido: true, valor: null })
  })

  it('recusa o que seria lido errado em silêncio', () => {
    expect(lerDinheiroBr('1,000.50')).toEqual({ valido: false })
    expect(lerDinheiroBr('500,000')).toEqual({ valido: false })
    expect(lerDinheiroBr('50.00.000')).toEqual({ valido: false })
    expect(lerDinheiroBr('-100')).toEqual({ valido: false })
    expect(lerDinheiroBr('quinhentos')).toEqual({ valido: false })
    expect(lerDinheiroBr('1,2,3')).toEqual({ valido: false })
  })
})

describe('formatação de valores', () => {
  it('formata em reais e prepara para edição sem perder o valor', () => {
    expect(formatarDinheiroBr('500000')).toBe('R$ 500.000,00')
    expect(formatarDinheiroBr(null)).toBe('—')
    expect(dinheiroBrParaEdicao('500000')).toBe('500.000,00')
    expect(dinheiroBrParaEdicao(null)).toBe('')
    expect(lerDinheiroBr(dinheiroBrParaEdicao('1234567.8'))).toEqual({ valido: true, valor: 1234567.8 })
  })

  it('descreve a faixa salva no cartão do item', () => {
    expect(faixaDeValorBr('50000', '500000')).toBe('de R$ 50.000,00 a R$ 500.000,00')
    expect(faixaDeValorBr('50000', null)).toBe('a partir de R$ 50.000,00')
    expect(faixaDeValorBr(null, '500000')).toBe('até R$ 500.000,00')
    expect(faixaDeValorBr(null, null)).toBeNull()
  })
})
