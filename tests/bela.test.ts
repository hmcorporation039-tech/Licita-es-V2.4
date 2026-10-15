import { describe, expect, it } from 'vitest'
import { interpretarPedido, lerValorFalado } from '../src/lib/bela/interpretar'
import { avaliarLance, avaliarMeuLance, limitesDoAlvo } from '../src/lib/bela/copiloto'

describe('Bela: pedido de busca falado', () => {
  it('entende objeto e UF no pedido do dia a dia', () => {
    expect(interpretarPedido('Bela, preciso de uma licitação de estrutura metálica no DF')).toMatchObject({ acao: 'buscar', filtros: { q: 'estrutura metálica', uf: 'DF' } })
  })

  it('entende modalidade, estado por extenso, capital e situação', () => {
    expect(interpretarPedido('bela procure pregão eletrônico de material de construção em Goiás')).toMatchObject({
      filtros: { q: 'material de construção', uf: 'GO', modalidade: 'PREGAO_ELETRONICO' },
    })
    expect(interpretarPedido('Bela licitações abertas de ar condicionado em Goiânia')).toMatchObject({
      filtros: { q: 'ar condicionado', municipio: 'Goiânia', uf: 'GO', situacao: 'ABERTA' },
    })
    expect(interpretarPedido('quero ver concorrência de pavimentação asfáltica no estado de São Paulo')).toMatchObject({
      filtros: { q: 'pavimentação asfáltica', uf: 'SP', modalidade: 'CONCORRENCIA' },
    })
  })

  it('não confunde palavra comum com sigla de estado', () => {
    const r = interpretarPedido('licitação em se tratando de cadeiras')
    expect(r.acao === 'buscar' && r.filtros.uf).toBeFalsy()
  })

  it('pede de novo quando não há o que buscar', () => {
    expect(interpretarPedido('Bela').acao).toBe('desconhecida')
    expect(interpretarPedido('   ').acao).toBe('desconhecida')
  })
})

describe('Bela: valor falado no pregão', () => {
  it.each([
    ['o lance está em 180 mil', 180_000],
    ['1,2 milhão', 1_200_000],
    ['baixou para 2 milhões e 300 mil', 2_300_000],
    ['3 mil e 500', 3_500],
    ['12,5 mil', 12_500],
    ['R$ 1.234.567,89', 1_234_567.89],
    ['3450,75', 3_450.75],
    ['450 reais e 50 centavos', 450.5],
  ])('%s', (frase, valor) => {
    expect(lerValorFalado(frase)).toBe(valor)
  })

  it('separa o número do item do valor do lance', () => {
    expect(interpretarPedido('item 3 caiu para 450 reais e 50 centavos', 'pregao')).toMatchObject({ acao: 'lance', item: 3, valor: 450.5 })
  })
})

describe('Bela: copiloto do lance', () => {
  const limites = { custoComRateio: 1000, impostosPct: 10, margemDesejadaPct: 10 }
  const regras = { decrementoPct: 0.5, maxLances: 2 }

  it('calcula o preço com a margem desejada e o ponto de equilíbrio', () => {
    expect(limitesDoAlvo(limites)).toEqual({ minimoComMargem: 1250, equilibrio: 1111.11 })
  })

  it('sugere cobrir o lance enquanto a margem desejada se mantém', () => {
    const a = avaliarLance(1400, limites, regras, 0)
    expect(a.faixa).toBe('verde')
    expect(a.sugestao).toEqual({ valor: 1393, margemPct: 18.2, ultimo: false })
    expect(a.mensagem).toContain('Sugiro cobrir com R$')
  })

  it('perto do limite, sugere um último lance exatamente no limite', () => {
    const a = avaliarLance(1255, limites, regras, 0)
    expect(a.sugestao).toMatchObject({ valor: 1250, ultimo: true })
  })

  it('abaixo do limite não sugere lance; abaixo do custo avisa prejuízo', () => {
    expect(avaliarLance(1200, limites, regras, 0)).toMatchObject({ faixa: 'amarela', sugestao: null })
    const prejuizo = avaliarLance(1100, limites, regras, 0)
    expect(prejuizo).toMatchObject({ faixa: 'vermelha', sugestao: null, lucro: -10 })
    expect(prejuizo.mensagem).toContain('prejuízo')
  })

  it('respeita o máximo de lances combinado', () => {
    const a = avaliarLance(1400, limites, regras, 2)
    expect(a.sugestao).toBeNull()
    expect(a.lancesRestantes).toBe(0)
    expect(a.mensagem).toContain('limite combinado')
    expect(avaliarLance(1400, limites, regras, 1).sugestao?.ultimo).toBe(true)
  })

  it('depois do meu lance, confirma a margem e espera o próximo lance em vez de repetir a sugestão', () => {
    const a = avaliarMeuLance(1393, limites, regras, 1)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).toContain('Seu lance de R$')
    expect(a.mensagem).toContain('Restam 1 lance')
    expect(avaliarMeuLance(1300, limites, regras, 2).mensagem).toContain('último lance combinado')
  })

  it('sem custos, não inventa margem', () => {
    const a = avaliarLance(1400, { ...limites, custoComRateio: 0 }, regras, 0)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).toContain('Preencha os custos')
  })
})
