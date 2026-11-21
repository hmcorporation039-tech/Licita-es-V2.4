import { describe, expect, it } from 'vitest'
import { montarPrimeirosPassos } from '../src/lib/primeirosPassos'

const zerado = { planCode: 'TESTE', itensMonitorados: 0, favoritas: 0, planosDeParticipacao: 0, perguntasAoEdital: 0, matches: 0, buscasEmAndamento: 0 }

describe('Primeiros passos do painel', () => {
  it('conta cada passo pela ação da empresa', () => {
    const r = montarPrimeirosPassos({ ...zerado, itensMonitorados: 1, matches: 12, buscasEmAndamento: 1 })
    expect(r).toMatchObject({ mostrar: true, feitos: 1, total: 3, matches: 12, buscando: true })
    expect(r.passos.map((p) => [p.id, p.feito])).toEqual([
      ['oQueVende', true],
      ['salvarLicitacao', false],
      ['perguntarAoEdital', false],
    ])
  })

  it('salvar vale tanto pela favorita quanto pelo plano de participação', () => {
    expect(montarPrimeirosPassos({ ...zerado, favoritas: 1 }).passos[1].feito).toBe(true)
    expect(montarPrimeirosPassos({ ...zerado, planosDeParticipacao: 2 }).passos[1].feito).toBe(true)
  })

  it('some com os três passos feitos', () => {
    const r = montarPrimeirosPassos({ ...zerado, itensMonitorados: 1, favoritas: 1, perguntasAoEdital: 1 })
    expect(r).toMatchObject({ mostrar: false, feitos: 3 })
  })

  it('só aparece no plano de teste', () => {
    expect(montarPrimeirosPassos({ ...zerado, planCode: 'PROFISSIONAL' }).mostrar).toBe(false)
    expect(montarPrimeirosPassos({ ...zerado, planCode: '' }).mostrar).toBe(false)
  })
})
