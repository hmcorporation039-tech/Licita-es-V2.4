import { describe, expect, it } from 'vitest'
import { esperaAntesDeTentarDeNovo } from '../src/lib/httpClient'

describe('esperaAntesDeTentarDeNovo', () => {
  it('cresce a cada tentativa até o teto', () => {
    expect(esperaAntesDeTentarDeNovo(1)).toBe(10_000)
    expect(esperaAntesDeTentarDeNovo(2)).toBe(20_000)
    expect(esperaAntesDeTentarDeNovo(3)).toBe(40_000)
    expect(esperaAntesDeTentarDeNovo(4)).toBe(60_000)
  })

  it('respeita o Retry-After do servidor, com teto', () => {
    expect(esperaAntesDeTentarDeNovo(1, '5')).toBe(5_000)
    expect(esperaAntesDeTentarDeNovo(1, '600')).toBe(60_000)
  })

  it('ignora Retry-After inválido', () => {
    expect(esperaAntesDeTentarDeNovo(1, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(10_000)
  })
})
