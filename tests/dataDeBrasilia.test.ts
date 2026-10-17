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

describe('prazo da licitação: dia sem hora depende da fonte, não da meia-noite UTC', () => {
  it('21:00 de Brasília no PNCP é hora de verdade, não um dia sem hora', async () => {
    const { ehDiaSemHoraDaLicitacao, fimDoPrazoDaLicitacao, formatarPrazoDaLicitacao } = await import('../src/lib/dataDeBrasilia')
    const prazo = dataDeBrasilia('2026-10-20T21:00:00')!
    expect(prazo.toISOString()).toBe('2026-10-21T00:00:00.000Z')
    expect(ehDiaSemHoraDaLicitacao(prazo, 'PNCP')).toBe(false)
    expect(fimDoPrazoDaLicitacao(prazo, 'PNCP').toISOString()).toBe('2026-10-21T00:00:00.000Z')
    expect(formatarPrazoDaLicitacao(prazo, 'PNCP')).toBe('20/10/2026 21:00')
  })

  it('PNCP à meia-noite de Brasília continua com hora', async () => {
    const { ehDiaSemHoraDaLicitacao, formatarPrazoDaLicitacao } = await import('../src/lib/dataDeBrasilia')
    const prazo = dataDeBrasilia('2026-10-20T00:00:00')!
    expect(ehDiaSemHoraDaLicitacao(prazo, 'PNCP')).toBe(false)
    expect(formatarPrazoDaLicitacao(prazo, 'PNCP')).toBe('20/10/2026 00:00')
  })

  it('data sem hora dos portais é a meia-noite de Brasília e vale até 23:59:59 daquele dia', async () => {
    const { ehDiaSemHoraDaLicitacao, fimDoPrazoDaLicitacao, formatarPrazoDaLicitacao } = await import('../src/lib/dataDeBrasilia')
    const { parseDataBr } = await import('../src/lib/scrapingHelpers')
    const prazo = parseDataBr('20/10/2026')!
    expect(ehDiaSemHoraDaLicitacao(prazo, 'SESC_REGIONAL')).toBe(true)
    expect(fimDoPrazoDaLicitacao(prazo, 'SESC_REGIONAL').toISOString()).toBe('2026-10-21T02:59:59.000Z')
    expect(formatarPrazoDaLicitacao(prazo, 'SESC_REGIONAL')).toBe('20/10/2026')
    expect(ehDiaSemHoraDaLicitacao(dataDeBrasilia('2026-10-20')!, 'COMPRASNET')).toBe(true)
  })

  it('portal com hora de verdade, inclusive 21:00, mantém a hora', async () => {
    const { ehDiaSemHoraDaLicitacao, formatarPrazoDaLicitacao } = await import('../src/lib/dataDeBrasilia')
    const { parseDataBr } = await import('../src/lib/scrapingHelpers')
    expect(ehDiaSemHoraDaLicitacao(parseDataBr('20/10/2026 09:30')!, 'NOVACAP')).toBe(false)
    expect(formatarPrazoDaLicitacao(parseDataBr('20/10/2026 21:00')!, 'NOVACAP')).toBe('20/10/2026 21:00')
  })

  it('dia de calendário digitado (validade de documento) sai no próprio dia', async () => {
    const { formatarDiaDoCalendario } = await import('../src/lib/dataDeBrasilia')
    expect(formatarDiaDoCalendario(new Date('2026-10-20'))).toBe('20/10/2026')
  })
})
