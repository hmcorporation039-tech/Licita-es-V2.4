import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { extrairMelhorLance, lerValorEmReais } from '../extensao-bela/lib/valor.mjs'

describe('lerValorEmReais', () => {
  it('lê moeda brasileira com R$, pontos de milhar e vírgula decimal', () => {
    expect(lerValorEmReais('R$ 180.000,00')).toBe(180000)
    expect(lerValorEmReais('1.234.567,89')).toBe(1234567.89)
    expect(lerValorEmReais('R$1.000')).toBe(1000)
    expect(lerValorEmReais('950,50')).toBe(950.5)
  })

  it('aceita espaço comum e espaço rígido', () => {
    expect(lerValorEmReais('R$  2.500,00')).toBe(2500)
  })

  it('devolve null para vazio, zero ou lixo', () => {
    expect(lerValorEmReais(null)).toBeNull()
    expect(lerValorEmReais('')).toBeNull()
    expect(lerValorEmReais('—')).toBeNull()
    expect(lerValorEmReais('R$ 0,00')).toBeNull()
  })
})

function raizFalsa(mapa: Record<string, string | null>) {
  return {
    querySelector(seletor: string) {
      if (!(seletor in mapa)) return null
      const texto = mapa[seletor]
      return texto === null ? null : { textContent: texto }
    },
  }
}

describe('extrairMelhorLance', () => {
  it('usa o primeiro seletor que tem valor válido', () => {
    const raiz = raizFalsa({ '#novo': null, '.melhor-lance': 'R$ 179.100,00' })
    expect(extrairMelhorLance(raiz, ['#novo', '.melhor-lance'])).toEqual({
      valor: 179100,
      seletor: '.melhor-lance',
    })
  })

  it('pula seletor sem elemento ou sem número', () => {
    const raiz = raizFalsa({ '#vazio': 'aguardando', '.ok': 'R$ 1.000,00' })
    expect(extrairMelhorLance(raiz, ['#ausente', '#vazio', '.ok'])).toEqual({
      valor: 1000,
      seletor: '.ok',
    })
  })

  it('devolve null quando nenhum seletor casa', () => {
    const raiz = raizFalsa({ '.x': 'sem valor' })
    expect(extrairMelhorLance(raiz, ['.x', '.y'])).toBeNull()
  })

  it('tolera seletor inválido sem quebrar', () => {
    const raiz = {
      querySelector(s: string) {
        if (s === '::ruim') throw new Error('seletor inválido')
        return { textContent: 'R$ 500,00' }
      },
    }
    expect(extrairMelhorLance(raiz, ['::ruim', '.bom'])).toEqual({ valor: 500, seletor: '.bom' })
  })
})
