import { describe, expect, it } from 'vitest'
import { arquivoDaAgenda, linkDoWhatsApp, textoParaWhatsApp, type LicitacaoParaCompartilhar } from '../web/src/lib/compartilharLicitacao'

const base: LicitacaoParaCompartilhar = {
  id: 'abc-123',
  objeto: 'Fornecimento de esquadrias de alumínio, com instalação; escola municipal',
  orgao: 'Prefeitura de Anápolis',
  local: 'Anápolis/GO',
  fonte: 'PNCP',
  encerramentoAt: '2026-10-24T12:00:00.000Z',
  aberturaAt: '2026-10-10T12:00:00.000Z',
  linkEdital: 'https://pncp.gov.br/app/editais/1',
}

describe('compartilhar a licitação', () => {
  it('o texto do WhatsApp traz objeto, órgão, prazo em Brasília, edital e o link da Licita Bela', () => {
    const texto = textoParaWhatsApp(base, 'https://www.licitabela.com.br')
    expect(texto).toContain('*Fornecimento de esquadrias')
    expect(texto).toContain('Prefeitura de Anápolis · Anápolis/GO')
    expect(texto).toContain('Prazo para enviar a proposta: 24/10/2026 09:00')
    expect(texto).toContain('Edital: https://pncp.gov.br/app/editais/1')
    expect(texto).toContain('Na Licita Bela: https://www.licitabela.com.br/tenders/abc-123')
    expect(linkDoWhatsApp('a b')).toBe('https://wa.me/?text=a%20b')
  })

  it('sem prazo de proposta usa a data da sessão e sem nada não inventa prazo', () => {
    expect(textoParaWhatsApp({ ...base, encerramentoAt: null }, 'https://x')).toContain('Data da sessão: 10/10/2026 09:00')
    expect(textoParaWhatsApp({ ...base, encerramentoAt: null, aberturaAt: null }, 'https://x')).not.toMatch(/Prazo|sessão/)
    expect(arquivoDaAgenda({ ...base, encerramentoAt: null, aberturaAt: null }, 'https://x')).toBeNull()
  })

  it('a agenda marca o horário exato com lembretes de 1 dia e 2 horas antes', () => {
    const dobrado = arquivoDaAgenda(base, 'https://www.licitabela.com.br', new Date('2026-10-20T10:00:00Z'))!
    const ics = dobrado.replace(/\r\n /g, '')
    expect(ics).toContain('DTSTART:20261024T120000Z')
    expect(ics).toContain('DTEND:20261024T123000Z')
    expect(ics).toContain('TRIGGER:-P1D')
    expect(ics).toContain('TRIGGER:-PT2H')
    expect(ics).toContain('SUMMARY:Prazo: Fornecimento de esquadrias de alumínio\\, com instalação\\; escola municipal')
    expect(dobrado.split('\r\n').every((linha) => new TextEncoder().encode(linha).length <= 75)).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('prazo só com o dia vira evento de dia inteiro, sem hora inventada', () => {
    const ics = arquivoDaAgenda({ ...base, fonte: 'TCE_RS', encerramentoAt: '2026-10-24T03:00:00.000Z' }, 'https://x')!
    expect(ics).toContain('DTSTART;VALUE=DATE:20261024')
    expect(ics).toContain('DTEND;VALUE=DATE:20261025')
  })
})
