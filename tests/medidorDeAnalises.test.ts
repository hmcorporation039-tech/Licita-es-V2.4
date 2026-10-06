import { describe, expect, it } from 'vitest'
import { inicioDoMesBrasilia, inicioDoProximoMesBrasilia, ROTULO_RECURSO } from '../src/lib/planos'

describe('medidor de análises: renovação da cota mensal', () => {
  it('a cota renova no dia 1º do mês seguinte, à meia-noite de Brasília (03:00 UTC)', () => {
    expect(inicioDoProximoMesBrasilia(new Date('2026-10-06T15:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(inicioDoProximoMesBrasilia(new Date('2026-12-20T12:00:00Z')).toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it('perto da virada do mês usa o dia de Brasília, não o de UTC', () => {
    // 01/11 01:00 UTC ainda é 31/10 22:00 em Brasília: o mês corrente é outubro e renova em 01/11.
    expect(inicioDoMesBrasilia(new Date('2026-11-01T01:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(inicioDoProximoMesBrasilia(new Date('2026-11-01T01:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
    // 01/11 04:00 UTC já é 01/11 em Brasília: renova só em 01/12.
    expect(inicioDoProximoMesBrasilia(new Date('2026-11-01T04:00:00Z')).toISOString()).toBe('2026-12-01T03:00:00.000Z')
  })

  it('o rótulo mostrado ao cliente não menciona IA', () => {
    expect(ROTULO_RECURSO.analisesIaMes).toBe('análises de edital no mês')
  })
})
