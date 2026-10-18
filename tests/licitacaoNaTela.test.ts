import { describe, expect, it } from 'vitest'
import { fimDasPropostas, localDaLicitacao } from '../web/src/lib/licitacaoNaTela'
import { fontesComLicitacaoAberta } from '../web/src/lib/fontes'

describe('prazo e local nas listas de Meus matches e Escolhidas', () => {
  it('usa o fim das propostas, no horário de Brasília', () => {
    expect(fimDasPropostas({ fonte: 'PNCP', encerramentoAt: '2026-10-21T00:00:00.000Z', aberturaAt: '2026-10-01T11:00:00.000Z' })).toBe('2026-10-20T21:00:00-03:00')
  })

  it('no PNCP sem fim das propostas não inventa prazo com o início das propostas', () => {
    expect(fimDasPropostas({ fonte: 'PNCP', encerramentoAt: null, aberturaAt: '2026-10-01T11:00:00.000Z' })).toBeNull()
  })

  it('em portal, a data da sessão é o prazo e dia sem hora continua sem hora', () => {
    expect(fimDasPropostas({ fonte: 'SESC_REGIONAL', encerramentoAt: null, aberturaAt: '2026-10-20T03:00:00.000Z' })).toBe('2026-10-20')
  })

  it('mostra município/UF e cai para a UF quando não há município', () => {
    expect(localDaLicitacao({ municipio: 'Anápolis', uf: 'GO' })).toBe('Anápolis/GO')
    expect(localDaLicitacao({ municipio: null, uf: 'DF' })).toBe('DF')
    expect(localDaLicitacao({})).toBe('UF n/d')
  })
})

describe('número de fontes na página de entrada', () => {
  it('usa o número de fontes com licitação aberta e nunca passa do que a faixa de logos mostra', () => {
    expect(fontesComLicitacaoAberta(6, 10)).toBe(6)
    expect(fontesComLicitacaoAberta(14, 10)).toBe(10)
  })

  it('sem dado confiável não mostra número', () => {
    expect(fontesComLicitacaoAberta(null, 10)).toBeNull()
    expect(fontesComLicitacaoAberta(undefined, 10)).toBeNull()
    expect(fontesComLicitacaoAberta(0, 10)).toBeNull()
    expect(fontesComLicitacaoAberta(Number.NaN, 10)).toBeNull()
  })
})
