import { describe, expect, it } from 'vitest'
import { dataDaSessao } from '../src/lib/dataDaSessao'

const inicio = new Date('2026-10-13T19:52:00Z')
const fim = new Date('2026-10-15T16:00:00Z')

describe('dataDaSessao', () => {
  it('PNCP e ComprasNet: a sessão é o fim do recebimento, não o início', () => {
    expect(dataDaSessao({ fonte: 'PNCP', aberturaAt: inicio, encerramentoAt: fim })).toBe(fim)
    expect(dataDaSessao({ fonte: 'COMPRASNET', aberturaAt: inicio, encerramentoAt: fim })).toBe(fim)
    expect(dataDaSessao({ fonte: 'PNCP', aberturaAt: inicio, encerramentoAt: null })).toBeNull()
  })

  it('FIEG e SESC Regional: a sessão vem na abertura', () => {
    expect(dataDaSessao({ fonte: 'FIEG', aberturaAt: inicio, encerramentoAt: null })).toBe(inicio)
    expect(dataDaSessao({ fonte: 'SESC_REGIONAL', aberturaAt: null, encerramentoAt: fim })).toBe(fim)
  })

  it('Querido Diário: a sessão lida no aviso vem na abertura', () => {
    expect(dataDaSessao({ fonte: 'QUERIDO_DIARIO', aberturaAt: inicio, encerramentoAt: fim })).toBe(inicio)
  })

  it('demais fontes: a sessão vem no encerramento', () => {
    expect(dataDaSessao({ fonte: 'SESC_GO', aberturaAt: null, encerramentoAt: fim })).toBe(fim)
    expect(dataDaSessao({ fonte: 'SEST_SENAT', aberturaAt: inicio, encerramentoAt: fim })).toBe(fim)
  })
})
