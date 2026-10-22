import { describe, expect, it } from 'vitest'
import { PORTAIS, idsDePortais, mascararLogin, portalPorId } from '../src/lib/portais'

describe('registro de portais', () => {
  it('tem o Compras.gov.br e os principais, todos com campos obrigatórios', () => {
    expect(idsDePortais()).toContain('COMPRASNET')
    expect(PORTAIS.length).toBeGreaterThanOrEqual(8)
    for (const p of PORTAIS) {
      expect(p.id).toMatch(/^[A-Z0-9_]+$/)
      expect(p.nome.length).toBeGreaterThan(0)
      expect(p.hosts.length).toBeGreaterThan(0)
      expect(['confirmar', 'permitida', 'vedada']).toContain(p.automacao)
    }
  })

  it('não tem ids repetidos', () => {
    expect(new Set(idsDePortais()).size).toBe(PORTAIS.length)
  })

  it('portalPorId acha e devolve null para desconhecido', () => {
    expect(portalPorId('COMPRASNET')?.nome).toBe('Compras.gov.br')
    expect(portalPorId('NAO_EXISTE')).toBeNull()
  })
})

describe('mascararLogin', () => {
  it('mascara e-mail preservando o domínio', () => {
    expect(mascararLogin('empresa@teste.com')).toBe('em•••••@teste.com')
  })

  it('mascara login comum deixando início e fim', () => {
    expect(mascararLogin('usuario123')).toBe('us•••••••3')
  })

  it('não vaza logins muito curtos', () => {
    expect(mascararLogin('ab')).toBe('••')
  })
})
