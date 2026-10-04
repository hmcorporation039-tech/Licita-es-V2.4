import { describe, expect, it } from 'vitest'
import { compararAnalises, resumoDasAlteracoes } from '../src/lib/revisaoDaAnalise'
import { analiseBase, exigencia } from './helpers/analises'

describe('compararAnalises', () => {
  it('análises idênticas: nenhuma alteração', () => {
    expect(compararAnalises(analiseBase(), analiseBase())).toEqual([])
  })

  it('diferença só de espaços ou quebra de linha não conta', () => {
    expect(compararAnalises(analiseBase({ resumo: 'Aquisição  de\nequipamentos.' }), analiseBase({ resumo: 'Aquisição de equipamentos.' }))).toEqual([])
  })

  it('campo de texto corrigido: antes, depois e o motivo do revisor', () => {
    const r = compararAnalises(
      analiseBase({ garantiaProposta: 'não exigida' }),
      analiseBase({ garantiaProposta: 'Garantia de proposta de 1% do valor estimado' }),
      [{ campo: 'garantiaProposta', motivo: 'O item 12.1 do edital exige 1%.' }]
    )
    expect(r).toEqual([
      { campo: 'garantiaProposta', tipo: 'alterado', antes: 'não exigida', depois: 'Garantia de proposta de 1% do valor estimado', motivo: 'O item 12.1 do edital exige 1%.' },
    ])
  })

  it('o motivo é casado pelo nome do campo sem diferenciar maiúsculas', () => {
    const r = compararAnalises(analiseBase({ valorEstimado: 'R$ 1' }), analiseBase({ valorEstimado: 'R$ 2' }), [{ campo: 'VALORESTIMADO', motivo: 'm' }])
    expect(r[0].motivo).toBe('m')
  })

  it('sem justificativa para o campo, o motivo fica nulo (a alteração aparece mesmo assim)', () => {
    const r = compararAnalises(analiseBase({ local: 'A' }), analiseBase({ local: 'B' }))
    expect(r[0]).toMatchObject({ campo: 'local', tipo: 'alterado', motivo: null })
  })

  it('listas: itens adicionados e removidos', () => {
    const r = compararAnalises(
      analiseBase({ documentosExigidos: ['Atestado de capacidade técnica', 'Documento inventado'] }),
      analiseBase({ documentosExigidos: ['Atestado de capacidade técnica', 'Registro no CREA'] })
    )
    expect(r.map((a) => [a.tipo, a.antes ?? a.depois])).toEqual([
      ['removido', 'Documento inventado'],
      ['adicionado', 'Registro no CREA'],
    ])
  })

  it('riscos: adicionado, removido e severidade alterada', () => {
    const r = compararAnalises(
      analiseBase({ riscos: [{ titulo: 'Prazo curto', descricao: 'd', severidade: 'baixa' }, { titulo: 'Risco falso', descricao: 'd', severidade: 'alta' }] }),
      analiseBase({ riscos: [{ titulo: 'Prazo curto', descricao: 'd', severidade: 'alta' }, { titulo: 'Visita obrigatória', descricao: 'd', severidade: 'media' }] })
    )
    expect(r.map((a) => `${a.tipo}:${a.antes ?? a.depois}`).sort()).toEqual([
      'adicionado:Visita obrigatória (media)',
      'alterado:Prazo curto (baixa)',
      'removido:Risco falso (alta)',
    ])
  })

  it('matriz: exigência inventada removida, omitida adicionada e página corrigida', () => {
    const base = exigencia('Apresentar atestado de capacidade técnica compatível com o objeto', { pagina: '5' })
    const r = compararAnalises(
      analiseBase({ matrizExigencias: [base, exigencia('Frota própria de dez veículos refrigerados')] }),
      analiseBase({ matrizExigencias: [{ ...base, pagina: '7' }, exigencia('Declaração de inexistência de fato impeditivo à habilitação')] })
    )
    const por = (t: string) => r.filter((a) => a.tipo === t).map((a) => a.antes ?? a.depois)
    expect(por('removido')).toEqual(['Frota própria de dez veículos refrigerados'])
    expect(por('adicionado')).toEqual(['Declaração de inexistência de fato impeditivo à habilitação'])
    const alterada = r.find((a) => a.tipo === 'alterado')!
    expect(alterada.depois).toMatch(/página 5 → 7/)
  })

  it('o detalhe de cada campo é limitado, mas o resumo mostra o total real', () => {
    const muitas = Array.from({ length: 100 }, (_, i) => exigencia(`Exigência numero ${i} do edital com texto suficiente`))
    const r = compararAnalises(analiseBase({ matrizExigencias: [] }), analiseBase({ matrizExigencias: muitas }))
    expect(r.length).toBe(60)
  })
})

describe('resumoDasAlteracoes', () => {
  it('conta por campo', () => {
    const r = compararAnalises(analiseBase({ local: 'A', pagamento: 'X' }), analiseBase({ local: 'B', pagamento: 'Y' }))
    expect(resumoDasAlteracoes(r)).toEqual({ total: 2, porCampo: { local: 1, pagamento: 1 } })
  })
})
