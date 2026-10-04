import { describe, expect, it } from 'vitest'
import { calcularAlertasLegais, lerPercentuais, lerValoresEmReais } from '../src/lib/alertasLegais'

const ids = (a: ReturnType<typeof calcularAlertasLegais>) => a.map((x) => x.id)

describe('lerPercentuais', () => {
  it('lê formatos comuns', () => {
    expect(lerPercentuais('garantia de 1%')).toEqual([1])
    expect(lerPercentuais('garantia de 1,5 % do valor')).toEqual([1.5])
    expect(lerPercentuais('5 (cinco) por cento do valor do contrato')).toEqual([5])
    expect(lerPercentuais('um por cento do valor estimado')).toEqual([1])
    expect(lerPercentuais('de 5% a 10%')).toEqual([5, 10])
  })

  it('não confunde com números que não são percentual', () => {
    expect(lerPercentuais('prazo de 10 dias, valor R$ 10.000,00')).toEqual([])
    expect(lerPercentuais('')).toEqual([])
  })
})

describe('lerValoresEmReais', () => {
  it('lê valores com separador de milhar e centavos', () => {
    expect(lerValoresEmReais('R$ 1.234.567,89')).toEqual([1234567.89])
    expect(lerValoresEmReais('R$ 500,00 e R$ 2.000,00')).toEqual([500, 2000])
    expect(lerValoresEmReais('R$ 1500')).toEqual([1500])
    expect(lerValoresEmReais('sem valores')).toEqual([])
  })
})

describe('garantia de proposta (art. 58, §1º: até 1%)', () => {
  it('acima de 1% gera alerta alto, com fundamento e o trecho do edital', () => {
    const a = calcularAlertasLegais({ garantiaProposta: 'Será exigida garantia de proposta de 2% do valor estimado.', valorEstimado: 1_000_000 })
    expect(ids(a)).toEqual(['garantia-proposta'])
    expect(a[0].gravidade).toBe('alta')
    expect(a[0].fundamento).toMatch(/art\. 58/)
    expect(a[0].trecho).toMatch(/2%/)
  })

  it('exatamente 1% não alerta', () => {
    expect(calcularAlertasLegais({ garantiaProposta: 'Garantia de 1% do valor estimado', valorEstimado: 1_000_000 })).toEqual([])
  })

  it('converte valor em reais quando o valor estimado é conhecido', () => {
    const acima = calcularAlertasLegais({ garantiaProposta: 'Garantia de proposta no valor de R$ 30.000,00', valorEstimado: 1_000_000 })
    expect(ids(acima)).toEqual(['garantia-proposta']) // 3%
    const dentro = calcularAlertasLegais({ garantiaProposta: 'Garantia de proposta no valor de R$ 10.000,00', valorEstimado: 1_000_000 })
    expect(dentro).toEqual([]) // 1%
  })

  it('sem valor estimado e sem percentual: não adivinha', () => {
    expect(calcularAlertasLegais({ garantiaProposta: 'Garantia de proposta de R$ 30.000,00', valorEstimado: null })).toEqual([])
  })

  it('"não exigida" e "não especificado" não alertam', () => {
    expect(calcularAlertasLegais({ garantiaProposta: 'Não será exigida garantia de proposta.', valorEstimado: 1 })).toEqual([])
    expect(calcularAlertasLegais({ garantiaProposta: 'não especificado no edital', valorEstimado: 1 })).toEqual([])
  })
})

describe('garantia contratual (art. 98: até 5%, 10% se justificada)', () => {
  it('entre 5% e 10%: atenção média, pedindo a justificativa', () => {
    const a = calcularAlertasLegais({ garantiaContratual: 'Garantia contratual de 8% do valor do contrato', valorEstimado: null })
    expect(a[0]).toMatchObject({ id: 'garantia-contratual', gravidade: 'media' })
    expect(a[0].detalhe).toMatch(/justificativa/)
  })

  it('acima de 10%: alto', () => {
    const a = calcularAlertasLegais({ garantiaContratual: '15% do valor contratado', valorEstimado: null })
    expect(a[0]).toMatchObject({ id: 'garantia-contratual', gravidade: 'alta' })
  })

  it('até 5% não alerta', () => {
    expect(calcularAlertasLegais({ garantiaContratual: 'Garantia de 5% do valor do contrato', valorEstimado: null })).toEqual([])
  })
})

describe('patrimônio líquido / capital mínimo (art. 69, §4º: até 10%)', () => {
  it('acima de 10% do valor estimado alerta', () => {
    const a = calcularAlertasLegais({ patrimonioLiquidoMinimo: 'Patrimônio líquido mínimo de 15% do valor estimado', valorEstimado: 2_000_000 })
    expect(a[0]).toMatchObject({ id: 'patrimonio-liquido', gravidade: 'alta' })
    expect(a[0].fundamento).toMatch(/art\. 69/)
  })

  it('valor em reais acima de 10% do estimado alerta; abaixo não', () => {
    expect(ids(calcularAlertasLegais({ patrimonioLiquidoMinimo: 'Patrimônio líquido mínimo de R$ 300.000,00', valorEstimado: 2_000_000 }))).toEqual(['patrimonio-liquido']) // 15%
    expect(calcularAlertasLegais({ patrimonioLiquidoMinimo: 'Patrimônio líquido mínimo de R$ 200.000,00', valorEstimado: 2_000_000 })).toEqual([]) // 10%
  })
})

describe('visita técnica (art. 63, §2º: precisa admitir declaração)', () => {
  it('obrigatória e sem alternativa: alerta', () => {
    const a = calcularAlertasLegais({ visitaTecnica: 'A visita técnica é obrigatória e deve ser agendada com 48h de antecedência.', valorEstimado: null })
    expect(a[0]).toMatchObject({ id: 'visita-tecnica', gravidade: 'media' })
    expect(a[0].fundamento).toMatch(/art\. 63/)
  })

  it('obrigatória mas com declaração substitutiva: não alerta', () => {
    expect(
      calcularAlertasLegais({ visitaTecnica: 'Visita técnica obrigatória, que poderá ser substituída por declaração do responsável técnico.', valorEstimado: null })
    ).toEqual([])
  })

  it('facultativa ou inexistente: não alerta', () => {
    expect(calcularAlertasLegais({ visitaTecnica: 'A visita técnica é facultativa.', valorEstimado: null })).toEqual([])
    expect(calcularAlertasLegais({ visitaTecnica: 'Não há exigência de visita técnica.', valorEstimado: null })).toEqual([])
  })
})

describe('combinações', () => {
  it('vários problemas no mesmo edital geram vários alertas', () => {
    const a = calcularAlertasLegais({
      garantiaProposta: '3% do valor estimado',
      patrimonioLiquidoMinimo: '20% do valor estimado',
      visitaTecnica: 'Visita técnica obrigatória.',
      valorEstimado: 1_000_000,
    })
    expect(ids(a).sort()).toEqual(['garantia-proposta', 'patrimonio-liquido', 'visita-tecnica'])
  })

  it('edital sem nenhum campo: nenhum alerta', () => {
    expect(calcularAlertasLegais({ valorEstimado: null })).toEqual([])
  })

  it('nunca afirma ilegalidade: o texto fala em "parece"', () => {
    const a = calcularAlertasLegais({ garantiaProposta: '5%', valorEstimado: null })
    expect(a[0].detalhe).toMatch(/parece/)
  })
})
