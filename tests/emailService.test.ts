import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const enviar = vi.hoisted(() => vi.fn(async () => ({ id: 'teste' })))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: enviar }
  },
}))

import { sendDocumentExpiryEmail, sendMatchEmail, sendTenderChangedEmail } from '../src/services/emailService'
import { dataDeBrasilia } from '../src/lib/dataDeBrasilia'
import { parseDataBr } from '../src/lib/scrapingHelpers'

const chaveOriginal = process.env.RESEND_API_KEY

function htmlEnviado(): string {
  const chamadas = enviar.mock.calls as unknown as Array<[{ html: string }]>
  return chamadas[chamadas.length - 1][0].html.replace(/\s/g, ' ')
}

describe('e-mails mostram data e valor no padrão de Brasília, qualquer que seja o fuso do servidor', () => {
  beforeAll(() => {
    process.env.RESEND_API_KEY = 'chave-de-teste'
  })
  afterAll(() => {
    if (chaveOriginal === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = chaveOriginal
  })
  beforeEach(() => enviar.mockClear())

  it('novo fim das propostas às 09:00 de Brasília aparece 09:00', async () => {
    await sendTenderChangedEmail({
      to: 'cliente@exemplo.com',
      tenderObjeto: 'Compra de cimento',
      campos: ['encerramentoAt'],
      encerramentoAt: dataDeBrasilia('2026-10-20T09:00:00'),
      fonte: 'PNCP',
    })
    expect(htmlEnviado()).toContain('Novo fim do recebimento de propostas:</strong> 20/10/2026 09:00')
  })

  it('21:00 de Brasília no PNCP não vira o dia seguinte', async () => {
    await sendTenderChangedEmail({
      to: 'cliente@exemplo.com',
      tenderObjeto: 'Compra de cimento',
      campos: ['encerramentoAt'],
      encerramentoAt: dataDeBrasilia('2026-10-20T21:00:00'),
      fonte: 'PNCP',
    })
    expect(htmlEnviado()).toContain('20/10/2026 21:00')
  })

  it('prazo só com o dia, de portal, sai sem hora inventada', async () => {
    await sendTenderChangedEmail({
      to: 'cliente@exemplo.com',
      tenderObjeto: 'Compra de cimento',
      campos: ['encerramentoAt'],
      encerramentoAt: parseDataBr('20/10/2026'),
      fonte: 'SESC_REGIONAL',
    })
    expect(htmlEnviado()).toContain('Novo fim do recebimento de propostas:</strong> 20/10/2026</p>')
  })

  it('valor estimado sai em reais com centavos', async () => {
    await sendMatchEmail({ to: 'cliente@exemplo.com', itemName: 'Cimento', tenderObjeto: 'Compra de cimento', valorEstimado: 1234.5 })
    expect(htmlEnviado()).toContain('Valor estimado:</strong> R$ 1.234,50')
  })

  it('validade do documento sai no dia digitado', async () => {
    await sendDocumentExpiryEmail({ to: 'cliente@exemplo.com', documentName: 'CND', diasRestantes: 3, dataValidade: new Date('2026-10-20') })
    expect(htmlEnviado()).toContain('Validade:</strong> 20/10/2026')
  })
})
