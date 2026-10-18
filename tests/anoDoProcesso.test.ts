import { describe, expect, it } from 'vitest'
import { anoDoProcesso, anoEmBrasilia } from '../src/lib/anoDoProcesso'

const AGORA = new Date('2026-10-17T15:00:00-03:00')

describe('anoDoProcesso', () => {
  it.each([
    ['SEST_SENAT', '089/2016', 2016],
    ['SEST_SENAT', 'DL008868-0/2026', 2026],
    ['SEST_SENAT', '080/16', 2016],
    ['SEST_SENAT', 'DL 123//2017', 2017],
    ['SEST_SENAT', '0532016', 2016],
    ['SEST_SENAT', '20170410', 2017],
    ['SEST_SENAT', '025-12017', 2017],
    ['SEST_SENAT', 'VITORIA0012018', 2018],
    ['SEST_SENAT', '0012018 1', 2018],
    ['SEST_SENAT', 'DP008_20', 2020],
    ['SEST_SENAT', '12/2017R', 2017],
    ['SESC_GO', '20/01.00199-DL', 2020],
    ['SESC_GO', '16/01.00012 - DL', 2016],
    ['SESC_GO', '0051/2026', 2026],
    ['SESC_REGIONAL', '000013-26-PG', 2026],
    ['SESC_REGIONAL', 'PE 0058.26', 2026],
    ['SESC_REGIONAL', '0032/26-PGE', 2026],
    ['SESC_REGIONAL', '75844.2026.DL.CD.5419.SESC FLAMENGO', 2026],
    ['SESC_REGIONAL', '098/2026 (Localizador Licitações-e: 1101036)', 2026],
    ['SISTEMA_S', 'SDE 2026004107', 2026],
    ['NOVACAP', '00001/2025', 2025],
  ] as const)('%s %s -> %i', (fonte, numero, ano) => {
    expect(anoDoProcesso(fonte, numero, AGORA)).toBe(ano)
  })

  it.each([
    ['SEST_SENAT', 'VES6201200101'],
    ['SEST_SENAT', '000030'],
    ['SEST_SENAT', '2012'],
    ['SEST_SENAT', 'FF44'],
    ['SEST_SENAT', '0045/2099'],
    ['SEST_SENAT', ''],
    ['SESC_GO', '999999999-DL'],
  ] as const)('não chuta o ano quando o número não deixa claro: %s %s', (fonte, numero) => {
    expect(anoDoProcesso(fonte, numero, AGORA)).toBeNull()
  })

  it('só vale para os portais com o ano no número', () => {
    expect(anoDoProcesso('PNCP', '089/2016', AGORA)).toBeNull()
    expect(anoDoProcesso('QUERIDO_DIARIO', 'Pregão nº 16/2025', AGORA)).toBeNull()
    expect(anoDoProcesso('SEST_SENAT', null, AGORA)).toBeNull()
  })

  it('o ano corrente é o de Brasília', () => {
    expect(anoEmBrasilia(new Date('2027-01-01T02:00:00Z'))).toBe(2026)
    expect(anoEmBrasilia(new Date('2027-01-01T03:00:00Z'))).toBe(2027)
  })
})
