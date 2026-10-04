import { describe, expect, it } from 'vitest'
import { DIAS_SEM_PRAZO, DatasDaLicitacao, estaAberta } from '../src/lib/licitacaoAberta'

const AGORA = new Date('2026-10-04T15:00:00')
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000)
const base = (o: Partial<DatasDaLicitacao> = {}): DatasDaLicitacao => ({
  fonte: 'PNCP', situacao: 'ABERTA', valorHomologado: null, encerramentoAt: null, aberturaAt: null, publicadoAt: dias(-5), createdAt: dias(-5), ...o,
})

describe('estaAberta', () => {
  it('com prazo de proposta: aberta até o prazo', () => {
    expect(estaAberta(base({ encerramentoAt: dias(3), publicadoAt: dias(-400) }), AGORA)).toBe(true) // publicação antiga não importa se o prazo é futuro
    expect(estaAberta(base({ encerramentoAt: dias(-1) }), AGORA)).toBe(false)
  })

  it('situação diferente de ABERTA ou homologada nunca está aberta', () => {
    for (const situacao of ['ENCERRADA', 'SUSPENSA', 'CANCELADA', 'ANULADA', 'HOMOLOGADA', 'REVOGADA'] as const) {
      expect(estaAberta(base({ situacao, encerramentoAt: dias(3) }), AGORA)).toBe(false)
    }
    expect(estaAberta(base({ valorHomologado: 1000, encerramentoAt: dias(3) }), AGORA)).toBe(false)
  })

  it('PNCP sem prazo (dispensa): só se publicada nos últimos 30 dias — aberturaAt (início das propostas) não conta', () => {
    expect(estaAberta(base({ aberturaAt: dias(-2), publicadoAt: dias(-(DIAS_SEM_PRAZO - 1)) }), AGORA)).toBe(true)
    expect(estaAberta(base({ aberturaAt: dias(-2), publicadoAt: dias(-(DIAS_SEM_PRAZO + 1)) }), AGORA)).toBe(false)
    expect(estaAberta(base({ publicadoAt: dias(-700) }), AGORA)).toBe(false) // "de anos anteriores"
  })

  it('portais do Sistema S/FIEG: aberturaAt é a sessão — aberta até o dia da sessão', () => {
    expect(estaAberta(base({ fonte: 'FIEG', aberturaAt: dias(5) }), AGORA)).toBe(true)
    expect(estaAberta(base({ fonte: 'SESC_REGIONAL', aberturaAt: new Date('2026-10-04T08:00:00') }), AGORA)).toBe(true) // sessão hoje cedo
    expect(estaAberta(base({ fonte: 'FIEG', aberturaAt: dias(-1), publicadoAt: dias(-1) }), AGORA)).toBe(false)
  })

  it('sem data de publicação usa a data da coleta', () => {
    expect(estaAberta(base({ publicadoAt: null, createdAt: dias(-3) }), AGORA)).toBe(true)
    expect(estaAberta(base({ publicadoAt: null, createdAt: dias(-90) }), AGORA)).toBe(false)
  })
})
