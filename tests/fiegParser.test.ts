import { describe, expect, it } from 'vitest'
import { ehPaginaDaListagemFieg, htmlDaFieg } from '../src/services/fiegParser'

describe('FIEG: página da listagem', () => {
  it('reconhece a listagem pelo banner ou pela lista', () => {
    expect(ehPaginaDaListagemFieg('<span class="pagebanner"> 0 itens encontrado(s) </span>')).toBe(true)
    expect(ehPaginaDaListagemFieg('<ul class="licitacoesLista"></ul>')).toBe(true)
  })

  it('página sem a listagem (bloqueio, erro) não passa por "zero licitações"', () => {
    expect(ehPaginaDaListagemFieg('<html><body><h1>Acesso bloqueado</h1></body></html>')).toBe(false)
  })

  it('decodifica a página em ISO-8859-1 sem estragar os acentos', () => {
    const latin1 = Buffer.from('<p>Cotação nº 026/0000 - Manutenção</p>', 'latin1')
    expect(htmlDaFieg(latin1, 'text/html; charset=ISO-8859-1')).toContain('Cotação nº 026/0000 - Manutenção')
    // Mesmo sem declarar o charset, ou declarando UTF-8 por engano.
    expect(htmlDaFieg(latin1, 'text/html')).toContain('Cotação nº')
    expect(htmlDaFieg(latin1, 'text/html; charset=UTF-8')).toContain('Manutenção')
    expect(htmlDaFieg(Buffer.from('<p>Cotação</p>', 'utf8'), 'text/html')).toContain('Cotação')
  })
})
