import { describe, expect, it } from 'vitest'
import { literalNoLike } from '../src/lib/buscaLiteral'

describe('literalNoLike', () => {
  it('escapa os curingas do LIKE e a própria barra', () => {
    expect(literalNoLike('100%')).toBe('100\\%')
    expect(literalNoLike('a_b')).toBe('a\\_b')
    expect(literalNoLike('c:\\x')).toBe('c:\\\\x')
    expect(literalNoLike('%%%')).toBe('\\%\\%\\%')
  })

  it('não mexe em texto comum', () => {
    expect(literalNoLike('material de limpeza 5/2026')).toBe('material de limpeza 5/2026')
  })
})
