import { describe, expect, it } from 'vitest'
import { dataDeBrasilia } from '../src/lib/dataDeBrasilia'

describe('dataDeBrasilia', () => {
  it('horário sem fuso do PNCP é hora de Brasília, qualquer que seja o fuso do servidor', () => {
    expect(dataDeBrasilia('2026-11-03T08:29:00')?.toISOString()).toBe('2026-11-03T11:29:00.000Z')
    expect(dataDeBrasilia('2026-11-03 08:29:00')?.toISOString()).toBe('2026-11-03T11:29:00.000Z')
  })

  it('respeita o fuso quando ele vem no texto', () => {
    expect(dataDeBrasilia('2026-11-03T08:29:00Z')?.toISOString()).toBe('2026-11-03T08:29:00.000Z')
    expect(dataDeBrasilia('2026-11-03T08:29:00-03:00')?.toISOString()).toBe('2026-11-03T11:29:00.000Z')
  })

  it('data sem hora é o início do dia em Brasília; vazio ou inválido não vira data', () => {
    expect(dataDeBrasilia('2026-11-03')?.toISOString()).toBe('2026-11-03T03:00:00.000Z')
    expect(dataDeBrasilia('')).toBeUndefined()
    expect(dataDeBrasilia(null)).toBeUndefined()
    expect(dataDeBrasilia('amanhã')).toBeUndefined()
  })
})
