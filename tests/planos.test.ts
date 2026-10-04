import { describe, expect, it } from 'vitest'
import { LIMITES_PADRAO, excedeu, inicioDoMesBrasilia, lerLimites, limitesEfetivos } from '../src/lib/planos'

describe('lerLimites', () => {
  it('lê limites válidos, inclusive null (ilimitado)', () => {
    expect(lerLimites({ itensMonitorados: null, usuarios: 5, analisesIaMes: 40 })).toEqual({
      itensMonitorados: null,
      usuarios: 5,
      analisesIaMes: 40,
    })
  })

  it('chave ausente ou inválida cai no padrão restritivo, nunca em ilimitado', () => {
    expect(lerLimites({ itensMonitorados: -1, usuarios: 'muitos' })).toEqual(LIMITES_PADRAO)
    expect(lerLimites(null)).toEqual(LIMITES_PADRAO)
    expect(lerLimites('lixo')).toEqual(LIMITES_PADRAO)
  })
})

describe('limitesEfetivos', () => {
  const plano = { itensMonitorados: 10, usuarios: 1, analisesIaMes: 10 }

  it('sem ajuste vale o plano', () => {
    expect(limitesEfetivos(plano, null)).toEqual(plano)
  })

  it('o ajuste combinado com o cliente vence o plano, só nas chaves informadas', () => {
    expect(limitesEfetivos(plano, { itensMonitorados: 30 })).toEqual({ itensMonitorados: 30, usuarios: 1, analisesIaMes: 10 })
    expect(limitesEfetivos(plano, { usuarios: null }).usuarios).toBeNull()
  })
})

describe('excedeu', () => {
  it('bloqueia ao atingir o limite (usado >= limite)', () => {
    expect(excedeu(3, 3)).toBe(true)
    expect(excedeu(2, 3)).toBe(false)
  })

  it('limite 0 bloqueia tudo; null nunca bloqueia', () => {
    expect(excedeu(0, 0)).toBe(true)
    expect(excedeu(1_000_000, null)).toBe(false)
  })
})

describe('inicioDoMesBrasilia', () => {
  it('o mês começa às 03:00 UTC do dia 1º', () => {
    expect(inicioDoMesBrasilia(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  it('nas primeiras horas UTC do dia 1º, Brasília ainda está no mês anterior', () => {
    expect(inicioDoMesBrasilia(new Date('2026-10-01T01:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })
})
