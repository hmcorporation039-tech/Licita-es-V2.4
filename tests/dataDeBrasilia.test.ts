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

describe('datas montadas em hora de Brasília', () => {
  it('horaDeBrasilia e parseDataBr não dependem do fuso do servidor', async () => {
    const { horaDeBrasilia } = await import('../src/lib/dataDeBrasilia')
    const { parseDataBr } = await import('../src/lib/scrapingHelpers')
    expect(horaDeBrasilia(2026, 9, 20, 9, 30).toISOString()).toBe('2026-10-20T12:30:00.000Z')
    expect(parseDataBr('20/10/2026 09:30')?.toISOString()).toBe('2026-10-20T12:30:00.000Z')
    expect(parseDataBr('20/10/2026')?.toISOString()).toBe('2026-10-20T03:00:00.000Z')
  })

  it('início do dia é a meia-noite de Brasília, mesmo de madrugada em UTC', async () => {
    const { inicioDoDiaEmBrasilia } = await import('../src/lib/dataDeBrasilia')
    expect(inicioDoDiaEmBrasilia(new Date('2026-10-21T01:00:00Z')).toISOString()).toBe('2026-10-20T03:00:00.000Z')
    expect(inicioDoDiaEmBrasilia(new Date('2026-10-20T15:00:00Z')).toISOString()).toBe('2026-10-20T03:00:00.000Z')
  })
})
