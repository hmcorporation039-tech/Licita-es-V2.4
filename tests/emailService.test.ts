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
    await sendMatchEmail({ to: 'cliente@exemplo.com', itemName: 'Cimento', tenderId: 't1', tenderObjeto: 'Compra de cimento', fonte: 'PNCP', valorEstimado: 1234.5 })
    expect(htmlEnviado()).toContain('Valor estimado:</strong> R$ 1.234,50')
  })

  describe('e-mail de match novo', () => {
    const appUrlOriginal = process.env.APP_URL
    beforeAll(() => {
      process.env.APP_URL = 'https://monitor.exemplo.com.br/'
    })
    afterAll(() => {
      if (appUrlOriginal === undefined) delete process.env.APP_URL
      else process.env.APP_URL = appUrlOriginal
    })

    it('traz prazo em Brasília, município/UF, órgão e o link para a licitação no Monitor, mesmo sem link de edital', async () => {
      await sendMatchEmail({
        to: 'cliente@exemplo.com',
        itemName: 'Cimento',
        tenderId: 'abc-123',
        tenderObjeto: 'Compra de cimento',
        fonte: 'PNCP',
        orgao: 'Prefeitura Municipal de Anápolis',
        municipio: 'Anápolis',
        uf: 'GO',
        encerramentoAt: dataDeBrasilia('2026-10-20T21:00:00'),
        linkEdital: null,
      })
      const html = htmlEnviado()
      expect(html).toContain('Prazo para enviar a proposta:</strong> 20/10/2026 21:00')
      expect(html).toContain('Município:</strong> Anápolis/GO')
      expect(html).toContain('Órgão:</strong> Prefeitura Municipal de Anápolis')
      expect(html).toContain('<a href="https://monitor.exemplo.com.br/tenders/abc-123">Abrir no Monitor de Licitações</a>')
      expect(html).not.toContain('Ver edital')
    })

    it('prazo só com o dia sai sem hora inventada e a sessão de portal vira o prazo', async () => {
      await sendMatchEmail({
        to: 'cliente@exemplo.com',
        itemName: 'Cimento',
        tenderId: 't2',
        tenderObjeto: 'Compra de cimento',
        fonte: 'SESC_REGIONAL',
        uf: 'DF',
        aberturaAt: parseDataBr('20/10/2026'),
        linkEdital: 'https://portal.exemplo.com.br/edital.pdf',
      })
      const html = htmlEnviado()
      expect(html).toContain('Data da sessão:</strong> 20/10/2026</p>')
      expect(html).toContain('UF:</strong> DF')
      expect(html).toContain('Ver edital na fonte')
    })

    it('no PNCP sem fim de propostas não usa o início das propostas como prazo', async () => {
      await sendMatchEmail({
        to: 'cliente@exemplo.com',
        itemName: 'Cimento',
        tenderId: 't3',
        tenderObjeto: 'Compra de cimento',
        fonte: 'PNCP',
        aberturaAt: dataDeBrasilia('2026-10-10T08:00:00'),
      })
      expect(htmlEnviado()).toContain('Prazo:</strong> não informado pela fonte (confira no edital)')
    })
  })

  it('validade do documento sai no dia digitado', async () => {
    await sendDocumentExpiryEmail({ to: 'cliente@exemplo.com', documentName: 'CND', diasRestantes: 3, dataValidade: new Date('2026-10-20') })
    expect(htmlEnviado()).toContain('Validade:</strong> 20/10/2026')
  })
})
