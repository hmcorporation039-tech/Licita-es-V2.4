import { describe, expect, it } from 'vitest'
import { cnpjValido, cpfValido, somenteDigitos } from '../src/lib/documentos'
import { gerarToken, hashDoToken, tokenUtilizavel } from '../src/lib/tokensDeConta'

describe('cpfValido', () => {
  it('aceita CPF real (com e sem máscara)', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
  })

  it('recusa dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('123')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('')).toBe(false)
  })
})

describe('cnpjValido', () => {
  it('aceita CNPJ real (com e sem máscara)', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000181')).toBe(true)
  })

  it('recusa dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('1122233300018')).toBe(false)
    expect(cnpjValido('00.000.000/0000-00')).toBe(false)
  })

  it('um CPF não passa como CNPJ e vice-versa', () => {
    expect(cnpjValido('52998224725')).toBe(false)
    expect(cpfValido('11222333000181')).toBe(false)
  })
})

describe('somenteDigitos', () => {
  it('remove máscara', () => {
    expect(somenteDigitos('11.222.333/0001-81')).toBe('11222333000181')
  })
})

describe('tokens de conta', () => {
  it('gera tokens longos, únicos e guarda só o hash', () => {
    const a = gerarToken()
    const b = gerarToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThanOrEqual(43)
    expect(a.hash).toBe(hashDoToken(a.token))
    expect(a.hash).not.toContain(a.token)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('token só é utilizável se não foi usado e não expirou', () => {
    const agora = new Date('2026-10-03T12:00:00Z')
    const futuro = new Date('2026-10-03T13:00:00Z')
    const passado = new Date('2026-10-03T11:00:00Z')
    expect(tokenUtilizavel({ usedAt: null, expiresAt: futuro }, agora)).toBe(true)
    expect(tokenUtilizavel({ usedAt: null, expiresAt: passado }, agora)).toBe(false)
    expect(tokenUtilizavel({ usedAt: passado, expiresAt: futuro }, agora)).toBe(false)
    expect(tokenUtilizavel(null, agora)).toBe(false)
  })
})
