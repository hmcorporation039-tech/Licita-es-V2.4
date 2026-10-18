import { describe, expect, it } from 'vitest'
import { interesseDaOrigem, interesseSchema, montarOrigem, nomeDoItemDoInteresse, utmSchema } from '../src/lib/origemDoCadastro'

describe('utmSchema', () => {
  it('aceita só as cinco chaves conhecidas e descarta as demais', () => {
    const lido = utmSchema.parse({ utm_source: ' google ', utm_medium: 'cpc', capturadoEm: '2026-10-16', gclid: 'x', utm_term: '' })
    expect(lido).toEqual({ utm_source: 'google', utm_medium: 'cpc', utm_term: undefined })
  })

  it('recusa valor acima de 200 caracteres', () => {
    expect(utmSchema.safeParse({ utm_campaign: 'a'.repeat(201) }).success).toBe(false)
    expect(utmSchema.safeParse({ utm_campaign: 'a'.repeat(200) }).success).toBe(true)
  })

  it('recusa valor que não é texto', () => {
    expect(utmSchema.safeParse({ utm_source: 42 }).success).toBe(false)
  })
})

describe('interesseSchema', () => {
  it('normaliza espaços e a UF', () => {
    expect(interesseSchema.parse({ termo: '  material   de limpeza ', uf: 'go' })).toEqual({ termo: 'material de limpeza', uf: 'GO' })
  })

  it('recusa UF inexistente e termo curto ou longo demais', () => {
    expect(interesseSchema.safeParse({ termo: 'notebook', uf: 'XX' }).success).toBe(false)
    expect(interesseSchema.safeParse({ termo: 'a' }).success).toBe(false)
    expect(interesseSchema.safeParse({ termo: 'a'.repeat(121) }).success).toBe(false)
    expect(interesseSchema.safeParse({ termo: 'de' }).success).toBe(false)
  })

  it('UF é opcional', () => {
    expect(interesseSchema.parse({ termo: 'notebook' })).toEqual({ termo: 'notebook' })
  })
})

describe('montarOrigem', () => {
  it('junta UTMs preenchidas e o interesse', () => {
    expect(montarOrigem({ utm_source: 'meta', utm_term: undefined }, { termo: 'notebook', uf: 'DF' })).toEqual({
      utm_source: 'meta',
      interesse: { termo: 'notebook', uf: 'DF' },
    })
  })

  it('sem nada útil devolve undefined', () => {
    expect(montarOrigem(undefined, undefined)).toBeUndefined()
    expect(montarOrigem({ utm_source: undefined }, undefined)).toBeUndefined()
  })
})

describe('interesseDaOrigem', () => {
  it('lê o interesse gravado e ignora formatos inválidos', () => {
    expect(interesseDaOrigem({ utm_source: 'meta', interesse: { termo: 'notebook', uf: 'SP' } })).toEqual({ termo: 'notebook', uf: 'SP' })
    expect(interesseDaOrigem({ interesse: { termo: 'x' } })).toBeNull()
    expect(interesseDaOrigem({ utm_source: 'meta' })).toBeNull()
    expect(interesseDaOrigem(null)).toBeNull()
    expect(interesseDaOrigem('texto')).toBeNull()
  })
})

describe('nomeDoItemDoInteresse', () => {
  it('usa o termo com a primeira letra maiúscula', () => {
    expect(nomeDoItemDoInteresse({ termo: 'material de limpeza' })).toBe('Material de limpeza')
    expect(nomeDoItemDoInteresse({ termo: 'ônibus escolar' })).toBe('Ônibus escolar')
  })
})
