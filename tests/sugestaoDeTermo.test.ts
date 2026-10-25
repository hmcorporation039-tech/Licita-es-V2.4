import { describe, expect, it } from 'vitest'
import { termosParaSugerir } from '../src/services/sugestaoDeTermo'

describe('termosParaSugerir', () => {
  it('normaliza (minúsculas, sem acento) e remove repetidos', () => {
    expect(termosParaSugerir(['Esquadrilhas', 'ESQUADRILHAS', 'esquádrilhas'])).toEqual(['esquadrilhas'])
  })

  it('deixa de fora código, termo composto e palavra curta', () => {
    expect(termosParaSugerir(['cat6', 'material de limpeza', 'ok'])).toEqual([])
  })

  it('deixa de fora termo só de palavras de ligação', () => {
    expect(termosParaSugerir(['de para com'])).toEqual([])
  })

  it('mantém uma palavra válida e simples', () => {
    expect(termosParaSugerir(['esquadrilhas', 'cadeira'])).toEqual(['esquadrilhas', 'cadeira'])
  })
})
