import { describe, expect, it } from 'vitest'
import { dataDaLicitacao, diasUteis, ehDataPura, faltamDiasUteis, fimDoDiaEmBrasilia, formatarData, formatarDataDaLicitacao, instanteDoPrazo } from '../web/src/lib/datas'

describe('dias úteis no singular e no plural', () => {
  it('1 dia útil, 2 dias úteis, sem "dia(s) útil(eis)"', () => {
    expect(diasUteis(1)).toBe('1 dia útil')
    expect(diasUteis(2)).toBe('2 dias úteis')
    expect(diasUteis(0)).toBe('0 dias úteis')
    expect(faltamDiasUteis(1)).toBe('Falta 1 dia útil.')
    expect(faltamDiasUteis(3)).toBe('Faltam 3 dias úteis.')
  })
})

describe('data da licitação no cabeçalho do estudo de custos', () => {
  it('sessão às 21:00 de Brasília gravada como 00:00Z aparece no dia certo, com a hora', () => {
    expect(formatarData('2026-10-21T00:00:00.000Z')).toBe('21/10/2026')
    expect(formatarDataDaLicitacao('2026-10-21T00:00:00.000Z', 'PNCP')).toBe('20/10/2026 21:00')
    expect(formatarDataDaLicitacao('2026-10-21T00:00:00.000Z', 'PNCP', { comHora: false })).toBe('20/10/2026')
  })

  it('dia sem hora de portal continua só com o dia', () => {
    expect(formatarDataDaLicitacao('2026-10-20T03:00:00.000Z', 'SESC_REGIONAL')).toBe('20/10/2026')
    expect(formatarDataDaLicitacao('2026-10-20T12:30:00.000Z', 'NOVACAP')).toBe('20/10/2026 09:30')
    expect(formatarDataDaLicitacao(null, 'PNCP')).toBe('—')
  })
})

describe('datas das licitações no painel', () => {
  it('prazo do PNCP às 21:00 de Brasília aparece com a hora e conta até 21:00', () => {
    const prazo = dataDaLicitacao('2026-10-21T00:00:00.000Z', 'PNCP')
    expect(prazo).toBe('2026-10-20T21:00:00-03:00')
    expect(ehDataPura(prazo)).toBe(false)
    expect(formatarData(prazo, { comHora: true })).toBe('20/10/2026 21:00')
    expect(instanteDoPrazo(prazo)?.toISOString()).toBe('2026-10-21T00:00:00.000Z')
  })

  it('PNCP à meia-noite de Brasília continua sendo hora, não dia inteiro', () => {
    const prazo = dataDaLicitacao('2026-10-20T03:00:00.000Z', 'PNCP')
    expect(formatarData(prazo, { comHora: true })).toBe('20/10/2026 00:00')
    expect(instanteDoPrazo(prazo)?.toISOString()).toBe('2026-10-20T03:00:00.000Z')
  })

  it('dia sem hora de portal aparece só com o dia e conta até 23:59 de Brasília', () => {
    const prazo = dataDaLicitacao('2026-10-20T03:00:00.000Z', 'SESC_REGIONAL')
    expect(prazo).toBe('2026-10-20')
    expect(formatarData(prazo, { comHora: true })).toBe('20/10/2026')
    expect(instanteDoPrazo(prazo)?.toISOString()).toBe('2026-10-21T02:59:59.000Z')
  })

  it('portal com hora de verdade mantém a hora', () => {
    const prazo = dataDaLicitacao('2026-10-20T12:30:00.000Z', 'NOVACAP')
    expect(formatarData(prazo, { comHora: true })).toBe('20/10/2026 09:30')
  })

  it('registro antigo em 00:00Z de portal cai no lado seguro: 21:00 da véspera', () => {
    const prazo = dataDaLicitacao('2026-10-20T00:00:00.000Z', 'SESC_REGIONAL')
    expect(formatarData(prazo, { comHora: true })).toBe('19/10/2026 21:00')
  })

  it('vazio, inválido e AAAA-MM-DD já explícito', () => {
    expect(dataDaLicitacao(null, 'PNCP')).toBeNull()
    expect(dataDaLicitacao('amanhã', 'PNCP')).toBeNull()
    expect(dataDaLicitacao('2026-10-20', 'PNCP')).toBe('2026-10-20')
  })

  it('datas de calendário digitadas (00:00Z) continuam como dia inteiro', () => {
    expect(formatarData('2026-10-20T00:00:00.000Z', { comHora: true })).toBe('20/10/2026')
    expect(instanteDoPrazo('2026-10-20T00:00:00.000Z')?.toISOString()).toBe('2026-10-21T02:59:59.000Z')
  })

  it('fim do dia de um instante com hora usa o dia de Brasília', () => {
    expect(fimDoDiaEmBrasilia('2026-10-21T01:00:00.000Z')?.toISOString()).toBe('2026-10-21T02:59:59.000Z')
  })
})
