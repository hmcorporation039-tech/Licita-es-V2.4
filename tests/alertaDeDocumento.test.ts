import { describe, expect, it } from 'vitest'
import { deveAlertarVencimento, marcoDoVencimento } from '../src/lib/alertaDeDocumento'

const DIA_MS = 24 * 60 * 60 * 1000
const AGORA = new Date('2026-10-22T12:00:00Z')
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA_MS)

describe('marcoDoVencimento', () => {
  it('encaixa os dias no marco mais apertado', () => {
    expect(marcoDoVencimento(40)).toBeNull()
    expect(marcoDoVencimento(30)).toBe(30)
    expect(marcoDoVencimento(16)).toBe(30)
    expect(marcoDoVencimento(15)).toBe(15)
    expect(marcoDoVencimento(6)).toBe(15)
    expect(marcoDoVencimento(5)).toBe(5)
    expect(marcoDoVencimento(0)).toBe(5)
    expect(marcoDoVencimento(-1)).toBe(0)
  })
})

describe('deveAlertarVencimento', () => {
  it('não avisa documento com mais de 30 dias', () => {
    expect(deveAlertarVencimento(31, null, AGORA)).toBe(false)
  })

  it('avisa a primeira vez em cada marco (30, 15, 5)', () => {
    expect(deveAlertarVencimento(30, null, AGORA)).toBe(true)
    expect(deveAlertarVencimento(15, null, AGORA)).toBe(true)
    expect(deveAlertarVencimento(5, null, AGORA)).toBe(true)
  })

  it('não repete dentro do mesmo marco', () => {
    expect(deveAlertarVencimento(28, haDias(2), AGORA)).toBe(false)
    expect(deveAlertarVencimento(12, haDias(2), AGORA)).toBe(false)
  })

  it('avisa de novo ao entrar num marco mais apertado', () => {
    expect(deveAlertarVencimento(15, haDias(13), AGORA)).toBe(true)
    expect(deveAlertarVencimento(5, haDias(9), AGORA)).toBe(true)
  })

  it('avisa quando vence (passa a vencido)', () => {
    expect(deveAlertarVencimento(-1, haDias(6), AGORA)).toBe(true)
  })

  it('não repete o aviso de vencido', () => {
    expect(deveAlertarVencimento(-3, haDias(2), AGORA)).toBe(false)
  })

  it('se o worker pulou marcos, avisa uma vez no mais urgente', () => {
    expect(deveAlertarVencimento(3, haDias(17), AGORA)).toBe(true)
  })
})
