import { describe, expect, it } from 'vitest'
import { linkDoEditalPncp, paginaDoEditalNoPncp } from '../src/lib/linkDoEdital'

const CONTROLE = '08761140000194-1-000040/2025'
const PAGINA = 'https://pncp.gov.br/app/editais/08761140000194/2025/40'

describe('link do edital do PNCP', () => {
  it('usa o link do sistema de origem quando é uma URL', () => {
    expect(linkDoEditalPncp('https://compras.gov.br/edital/1', null, CONTROLE)).toBe('https://compras.gov.br/edital/1')
  })

  it('completa o https de endereço sem esquema', () => {
    expect(linkDoEditalPncp('contratosgov.com.br/edital/123', null, CONTROLE)).toBe('https://contratosgov.com.br/edital/123')
    expect(linkDoEditalPncp('sai.io.org.br', null, CONTROLE)).toBe('https://sai.io.org.br/')
  })

  it('e-mail, espaço ou texto solto caem na página do edital no PNCP', () => {
    expect(linkDoEditalPncp('licitacao@prefeitura.gov.br', null, CONTROLE)).toBe(PAGINA)
    expect(linkDoEditalPncp(' ', undefined, CONTROLE)).toBe(PAGINA)
    expect(linkDoEditalPncp('ver no site da prefeitura', null, CONTROLE)).toBe(PAGINA)
    expect(linkDoEditalPncp(null, null, CONTROLE)).toBe(PAGINA)
  })

  it('javascript: nunca vira link', () => {
    expect(linkDoEditalPncp('javascript:alert(1)', null, CONTROLE)).toBe(PAGINA)
  })

  it('sem número de controle válido, sem link', () => {
    expect(linkDoEditalPncp(null, null, 'abc')).toBeUndefined()
    expect(paginaDoEditalNoPncp(null)).toBeNull()
  })
})
