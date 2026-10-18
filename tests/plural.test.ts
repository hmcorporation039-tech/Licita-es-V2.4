import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const enviar = vi.hoisted(() => vi.fn(async () => ({ id: 'teste' })))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: enviar }
  },
}))

import { emDias, quandoVence, quantidadeCom } from '../src/lib/plural'
import { sendDocumentExpiryEmail } from '../src/services/emailService'
import { calcularAderencia, type EntradaDeAderencia } from '../src/lib/aderencia'
import { palavraDias } from '../web/src/lib/datas'

describe('singular e plural sem "dia(s)"', () => {
  it('1 dia, 2 dias, 0 dias, 1.000 dias', () => {
    expect(emDias(1)).toBe('1 dia')
    expect(emDias(2)).toBe('2 dias')
    expect(emDias(0)).toBe('0 dias')
    expect(emDias(1000)).toBe('1.000 dias')
    expect(quantidadeCom(1, 'licitação', 'licitações')).toBe('1 licitação')
    expect(quantidadeCom(3, 'licitação', 'licitações')).toBe('3 licitações')
  })

  it('vencimento: hoje, amanhã e em N dias', () => {
    expect(quandoVence(0)).toBe('vence hoje')
    expect(quandoVence(1)).toBe('vence amanhã')
    expect(quandoVence(5)).toBe('vence em 5 dias')
  })

  it('tela do estudo usa a mesma regra', () => {
    expect(palavraDias(1)).toBe('dia')
    expect(palavraDias(-1)).toBe('dia')
    expect(palavraDias(0)).toBe('dias')
    expect(palavraDias(7)).toBe('dias')
  })
})

describe('e-mail de documento vencendo', () => {
  const chaveOriginal = process.env.RESEND_API_KEY
  beforeAll(() => {
    process.env.RESEND_API_KEY = 'chave-de-teste'
  })
  afterAll(() => {
    if (chaveOriginal === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = chaveOriginal
  })
  beforeEach(() => enviar.mockClear())

  const enviado = () => (enviar.mock.calls as unknown as Array<[{ subject: string; html: string }]>)[0][0]

  it.each([
    [0, 'Documento vence hoje: CND', '(vence hoje)'],
    [1, 'Documento vence amanhã: CND', '(vence amanhã)'],
    [3, 'Documento vence em 3 dias: CND', '(vence em 3 dias)'],
  ])('faltando %i dias', async (diasRestantes, assunto, trecho) => {
    await sendDocumentExpiryEmail({ to: 'cliente@exemplo.com', documentName: 'CND', diasRestantes, dataValidade: new Date('2026-10-20') })
    expect(enviado().subject).toBe(assunto)
    expect(enviado().html).toContain(trecho)
    expect(enviado().html).not.toContain('dia(s)')
  })

  it('vencido continua dizendo que já venceu', async () => {
    await sendDocumentExpiryEmail({ to: 'cliente@exemplo.com', documentName: 'CND', diasRestantes: -2, dataValidade: new Date('2026-10-20') })
    expect(enviado().subject).toBe('Documento vencido: CND')
    expect(enviado().html).toContain('(já venceu)')
  })
})

describe('texto de prazo da aderência', () => {
  const agora = new Date('2026-10-05T12:00:00Z')
  const motivoDoPrazo = (dias: number) => {
    const entrada: EntradaDeAderencia = {
      porCodigo: false,
      palavrasEncontradas: 1,
      palavrasTotal: 1,
      item: { ufs: [], valorMin: null, valorMax: null, raioKm: null, origemLat: null, origemLng: null },
      tender: { uf: 'DF', valorEstimado: 100_000, encerramentoAt: new Date(agora.getTime() + dias * 86_400_000), municipioLat: null, municipioLng: null },
      agora,
    }
    return calcularAderencia(entrada).criterios.find((c) => c.id === 'prazo')!.motivo
  }

  it('Falta 1 dia, Faltam 4 dias, Falta menos de 1 dia', () => {
    expect(motivoDoPrazo(1.5)).toBe('Falta 1 dia: prazo muito curto.')
    expect(motivoDoPrazo(4.2)).toBe('Faltam 4 dias: prazo apertado.')
    expect(motivoDoPrazo(0.5)).toBe('Falta menos de 1 dia: encerra quase agora.')
  })
})
