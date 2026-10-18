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

  it('entende vários estados no mesmo pedido, por extenso, por sigla e com "ou"', () => {
    expect(interpretarPedido('Bela, licitação de material de limpeza em Goiás, DF e Minas Gerais')).toMatchObject({
      acao: 'buscar',
      filtros: { q: 'material de limpeza', ufs: ['GO', 'DF', 'MG'], rotuloDoLocal: 'em GO, DF e MG' },
    })
    expect(interpretarPedido('consultoria de TI em São Paulo e no Rio de Janeiro')).toMatchObject({ filtros: { q: 'consultoria de ti', ufs: ['SP', 'RJ'] } })
    expect(interpretarPedido('notebook em GO ou SP')).toMatchObject({ filtros: { q: 'notebook', ufs: ['GO', 'SP'] } })
  })

  it('entende regiões do país', () => {
    expect(interpretarPedido('pregão de notebook no Nordeste')).toMatchObject({
      filtros: { q: 'notebook', modalidade: 'PREGAO_ELETRONICO', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], rotuloDoLocal: 'no Nordeste' },
    })
    expect(interpretarPedido('estrutura metálica na região sul')).toMatchObject({ filtros: { q: 'estrutura metálica', ufs: ['PR', 'RS', 'SC'] } })
    expect(interpretarPedido('limpeza no norte e nordeste')).toMatchObject({ filtros: { q: 'limpeza', rotuloDoLocal: 'no Norte e Nordeste' } })
    expect(interpretarPedido('limpeza no centro-oeste')).toMatchObject({ filtros: { ufs: ['DF', 'GO', 'MT', 'MS'] } })
  })

  it('não confunde estado com região nem a preposição "para" com o Pará', () => {
    expect(interpretarPedido('obras no Rio Grande do Sul')).toMatchObject({ filtros: { q: 'obras', uf: 'RS' } })
    const paraEscolas = interpretarPedido('material para escolas em Goiás')
    expect(paraEscolas).toMatchObject({ filtros: { q: 'material para escolas', uf: 'GO' } })
    expect(paraEscolas.acao === 'buscar' && paraEscolas.filtros.ufs).toBeFalsy()
    expect(interpretarPedido('ar condicionado no Pará')).toMatchObject({ filtros: { q: 'ar condicionado', uf: 'PA' } })
  })

  it('ignora "só", "somente", "apenas" e outras palavras de conversa no objeto', () => {
    expect(interpretarPedido('Bela, pregão eletrônico de notebook no DF, só as abertas')).toMatchObject({
      filtros: { q: 'notebook', uf: 'DF', modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA' },
    })
    expect(interpretarPedido('somente cadeiras em Goiás')).toMatchObject({ filtros: { q: 'cadeiras', uf: 'GO' } })
    expect(interpretarPedido('notebook apenas no DF')).toMatchObject({ filtros: { q: 'notebook', uf: 'DF' } })
    expect(interpretarPedido('se tiver licitação de asfalto')).toMatchObject({ filtros: { q: 'asfalto' } })
    expect(interpretarPedido('tem alguma licitação de merenda escolar?')).toMatchObject({ filtros: { q: 'merenda escolar' } })
    expect(interpretarPedido('existe licitação de pneus em Goiás')).toMatchObject({ filtros: { q: 'pneus', uf: 'GO' } })
    expect(interpretarPedido('quero ver licitação de uniformes')).toMatchObject({ filtros: { q: 'uniformes' } })
  })

  it('"de natal" é parte do objeto, não a capital do RN', () => {
    const decoracao = interpretarPedido('decoração de natal em São Paulo')
    expect(decoracao).toMatchObject({ filtros: { q: 'decoração de natal', uf: 'SP' } })
    expect(decoracao.acao === 'buscar' && decoracao.filtros.municipio).toBeFalsy()
    const cestas = interpretarPedido('cestas de natal')
    expect(cestas).toMatchObject({ filtros: { q: 'cestas de natal' } })
    expect(cestas.acao === 'buscar' && (cestas.filtros.uf || cestas.filtros.municipio)).toBeFalsy()
    expect(interpretarPedido('iluminação de natal no Paraná')).toMatchObject({ filtros: { q: 'iluminação de natal', uf: 'PR' } })
    expect(interpretarPedido('árvore de natal em Natal')).toMatchObject({ filtros: { q: 'árvore de natal', municipio: 'Natal', uf: 'RN' } })
  })

  it('não lê cidade de nome composto como a capital de mesmo começo', () => {
    expect(interpretarPedido('merenda escolar em Vitória da Conquista na Bahia')).toMatchObject({
      filtros: { q: 'merenda escolar', municipio: 'Vitória da Conquista', uf: 'BA' },
    })
    expect(interpretarPedido('merenda escolar em Vitória da Conquista')).toMatchObject({
      filtros: { q: 'merenda escolar', municipio: 'Vitória da Conquista', uf: 'BA' },
    })
    expect(interpretarPedido('merenda escolar em Vitória')).toMatchObject({ filtros: { q: 'merenda escolar', municipio: 'Vitória', uf: 'ES' } })
    const outroNome = interpretarPedido('material em Vitória da Silva')
    expect(outroNome.acao === 'buscar' && (outroNome.filtros.municipio || outroNome.filtros.uf)).toBeFalsy()
  })

  it('com capital e estado diferentes, fica com o estado dito', () => {
    const r = interpretarPedido('obras em Curitiba na Bahia')
    expect(r).toMatchObject({ filtros: { uf: 'BA' } })
    expect(r.acao === 'buscar' && r.filtros.municipio).toBeFalsy()
    expect(interpretarPedido('limpeza em Goiânia em Goiás')).toMatchObject({ filtros: { q: 'limpeza', municipio: 'Goiânia', uf: 'GO' } })
  })

  it('"dispensa" falada cobre as dispensas com e sem disputa', () => {
    const r = interpretarPedido('dispensa de material de limpeza')
    expect(r).toMatchObject({ filtros: { q: 'material de limpeza', modalidades: ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'] } })
    expect(r.acao === 'buscar' && r.filtros.modalidade).toBeFalsy()
    expect(interpretarPedido('dispensa eletrônica de material de limpeza')).toMatchObject({ filtros: { q: 'material de limpeza', modalidade: 'DISPENSA_COM_DISPUTA' } })
    expect(interpretarPedido('dispensa com disputa de café')).toMatchObject({ filtros: { q: 'café', modalidade: 'DISPENSA_COM_DISPUTA' } })
  })

  it('"sul de Minas" é o sul do estado de Minas Gerais, não a região Sul', () => {
    const r = interpretarPedido('café no sul de Minas')
    expect(r).toMatchObject({ filtros: { q: 'café', uf: 'MG' } })
    expect(r.acao === 'buscar' && r.filtros.ufs).toBeFalsy()
    expect(interpretarPedido('leite no norte do Paraná')).toMatchObject({ filtros: { q: 'leite', uf: 'PR' } })
    expect(interpretarPedido('estrutura metálica no sul')).toMatchObject({ filtros: { ufs: ['PR', 'RS', 'SC'] } })
  })

  it('reconhece município do interior pela tabela do IBGE', () => {
    expect(interpretarPedido('licitação de material de limpeza em Vitória da Conquista')).toMatchObject({
      acao: 'buscar',
      filtros: { q: 'material de limpeza', municipio: 'Vitória da Conquista', uf: 'BA' },
      resumo: 'Buscando "material de limpeza" em Vitória da Conquista/BA.',
    })
    expect(interpretarPedido('licitação de material de limpeza em São José dos Campos')).toMatchObject({
      filtros: { q: 'material de limpeza', municipio: 'São José dos Campos', uf: 'SP' },
    })
    expect(interpretarPedido('notebook em Campinas')).toMatchObject({ filtros: { q: 'notebook', municipio: 'Campinas', uf: 'SP' } })
    expect(interpretarPedido('limpeza em embu-guaçu')).toMatchObject({ filtros: { q: 'limpeza', municipio: 'Embu-Guaçu', uf: 'SP' } })
    expect(interpretarPedido('pneus na Prefeitura de São José dos Campos')).toMatchObject({ filtros: { municipio: 'São José dos Campos', uf: 'SP' } })
    expect(interpretarPedido('pregão de pneus em Uberlândia')).toMatchObject({ filtros: { q: 'pneus', municipio: 'Uberlândia', uf: 'MG', modalidade: 'PREGAO_ELETRONICO' } })
    expect(interpretarPedido('dispensa de material de limpeza em vitoria da conquista, só as abertas')).toMatchObject({
      filtros: { q: 'material de limpeza', municipio: 'Vitoria da Conquista', uf: 'BA', modalidades: ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'], situacao: 'ABERTA' },
    })
  })

  it('fica com o nome mais longo: Rio Branco do Sul não é Rio Branco', () => {
    expect(interpretarPedido('pavimentação em Rio Branco do Sul')).toMatchObject({ filtros: { q: 'pavimentação', municipio: 'Rio Branco do Sul', uf: 'PR' } })
    expect(interpretarPedido('pavimentação em Rio Branco do Sul no Paraná')).toMatchObject({ filtros: { q: 'pavimentação', municipio: 'Rio Branco do Sul', uf: 'PR' } })
    expect(interpretarPedido('merenda em Rio Branco')).toMatchObject({ filtros: { q: 'merenda', municipio: 'Rio Branco', uf: 'AC' } })
  })

  it('desempata município de nome repetido pelo estado dito', () => {
    expect(interpretarPedido('pneus em Palmas')).toMatchObject({ filtros: { municipio: 'Palmas', uf: 'TO' } })
    expect(interpretarPedido('pneus em Palmas no Paraná')).toMatchObject({ filtros: { q: 'pneus', municipio: 'Palmas', uf: 'PR' } })
    expect(interpretarPedido('uniformes em Santa Luzia em Minas Gerais')).toMatchObject({ filtros: { q: 'uniformes', municipio: 'Santa Luzia', uf: 'MG' } })
    const semEstado = interpretarPedido('uniformes em Santa Luzia')
    expect(semEstado).toMatchObject({ filtros: { q: 'uniformes', municipio: 'Santa Luzia' }, resumo: 'Buscando "uniformes" em Santa Luzia.' })
    expect(semEstado.acao === 'buscar' && semEstado.filtros.uf).toBeFalsy()
    expect(interpretarPedido('uniformes em Santa Luzia, PB')).toMatchObject({ filtros: { q: 'uniformes', municipio: 'Santa Luzia', uf: 'PB' } })
  })

  it('palavra comum que também é município vira texto, a não ser que venha com o estado', () => {
    for (const frase of ['material em Esperança', 'obras em Bonito', 'joias em ouro', 'lustres em cristal', 'peças em prata', 'cabos em barra', 'tecido em luz', 'tinta em Formosa']) {
      const r = interpretarPedido(frase)
      expect(r.acao === 'buscar' && (r.filtros.municipio || r.filtros.uf), frase).toBeFalsy()
    }
    expect(interpretarPedido('material em Esperança na Paraíba')).toMatchObject({ filtros: { q: 'material', municipio: 'Esperança', uf: 'PB' } })
    expect(interpretarPedido('obras em Bonito no Mato Grosso do Sul')).toMatchObject({ filtros: { q: 'obras', municipio: 'Bonito', uf: 'MS' } })
    expect(interpretarPedido('tinta em Formosa em Goiás')).toMatchObject({ filtros: { q: 'tinta', municipio: 'Formosa', uf: 'GO' } })
    expect(interpretarPedido('lâmpadas em Luz, MG')).toMatchObject({ filtros: { q: 'lâmpadas', municipio: 'Luz', uf: 'MG' } })
  })

  it('"de" seguido de palavra solta não vira município', () => {
    for (const frase of ['fornecimento de areia', 'kit de pedra', 'cestas de natal no RN', 'iluminação de natal', 'material de cascavel', 'aquisição de canoas']) {
      const r = interpretarPedido(frase)
      expect(r.acao === 'buscar' && r.filtros.municipio, frase).toBeFalsy()
    }
    expect(interpretarPedido('fornecimento de areia branca em Goiás')).toMatchObject({ filtros: { q: 'fornecimento de areia branca', uf: 'GO' } })
  })

  it('estado com nome de município continua sendo o estado', () => {
    const sp = interpretarPedido('consultoria em São Paulo')
    expect(sp).toMatchObject({ filtros: { q: 'consultoria', uf: 'SP' } })
    expect(sp.acao === 'buscar' && sp.filtros.municipio).toBeFalsy()
    const go = interpretarPedido('obras em Goiás')
    expect(go.acao === 'buscar' && go.filtros.municipio).toBeFalsy()
    expect(interpretarPedido('limpeza no Paraná')).toMatchObject({ filtros: { q: 'limpeza', uf: 'PR' } })
    expect(interpretarPedido('limpeza no Tocantins')).toMatchObject({ filtros: { uf: 'TO' } })
  })

  it('município em estado diferente do dito fica com o estado', () => {
    const r = interpretarPedido('pavimentação em Vitória da Conquista em Goiás')
    expect(r).toMatchObject({ filtros: { uf: 'GO' } })
    expect(r.acao === 'buscar' && r.filtros.municipio).toBeFalsy()
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
    ['180 mil', 180_000],
    ['1,5 milhão', 1_500_000],
    ['3.112 reais', 3_112],
    ['180 mil e 500', 180_500],
    ['1.234.567,89', 1_234_567.89],
    ['R$ 3.084,50', 3_084.5],
    ['99 centavos', 0.99],
    ['o lance está em 85 centavos', 0.85],
    ['3 reais e 50', 3.5],
    ['3 reais e 5', 3.05],
    ['1 milhão 250 mil', 1_250_000],
    ['1 milhão e 250 mil', 1_250_000],
    ['2 mil 500', 2_500],
    ['450 e 50 centavos', 450.5],
    ['o melhor lance do item 3 está em 1.250', 1_250],
    ['item número 2 caiu para 3 mil', 3_000],
  ])('%s', (frase, valor) => {
    expect(lerValorFalado(frase)).toBe(valor)
  })

  it.each([
    '180 mil 300 200',
    '500 2 mil',
    '2 milhões e 300',
    '1 milhão 250',
    '3 reais e 50 e 2',
    '3 reais e 150',
    '3,50 reais e 20 centavos',
    'o lance está em 180 mil e o meu em 190 mil',
    '50 centavos e 3 reais',
    'mil reais',
    '1,234',
    'o lance está em 1,234',
    '12,3456',
    '1.2345',
  ])('não chuta quando sobra número sem sentido claro: %s', (frase) => {
    expect(lerValorFalado(frase)).toBeNull()
  })

  it('separa o número do item do valor do lance', () => {
    expect(interpretarPedido('item 3 caiu para 450 reais e 50 centavos', 'pregao')).toMatchObject({ acao: 'lance', item: 3, valor: 450.5 })
    expect(interpretarPedido('item 3 … 1.250', 'pregao')).toMatchObject({ acao: 'lance', item: 3, valor: 1_250 })
  })

  it('pede de novo em vez de truncar o valor', () => {
    expect(interpretarPedido('o lance está em 2 milhões e 300', 'pregao').acao).toBe('desconhecida')
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

  it('perto do limite, não sugere lance que não cabe no intervalo mínimo', () => {
    const a = avaliarLance(1255, limites, regras, 0)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).toContain('não cabe no intervalo mínimo')
    expect(avaliarLance(1256.29, limites, regras, 0).sugestao).toMatchObject({ valor: 1250 })
  })

  it('limite a só 0,5% do melhor lance com decremento de 1%: não sugere o limite', () => {
    const custo = { custoComRateio: 995 * 0.8, impostosPct: 10, margemDesejadaPct: 10 }
    expect(limitesDoAlvo(custo).minimoComMargem).toBe(995)
    const a = avaliarLance(1000, custo, { decrementoPct: 1, maxLances: 3 }, 0)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).not.toContain('Dá para um último lance')
    expect(a.mensagem).toMatch(/no máximo R\$\s990,00/)
    expect(a.mensagem).toContain('não cabe no intervalo mínimo')
    expect(avaliarLance(1005.06, custo, { decrementoPct: 1, maxLances: 3 }, 0).sugestao).toMatchObject({ valor: 995 })
  })

  it('melhor lance igual ao limite: não diz que está abaixo', () => {
    const a = avaliarLance(1250, limites, regras, 0)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).not.toContain('Abaixo do seu limite')
    expect(a.mensagem).toContain('já está no seu limite de R$')
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
    expect(a.mensagem).toContain('Resta 1 lance')
    expect(avaliarMeuLance(1300, limites, regras, 2).mensagem).toContain('último lance combinado')
  })

  it('melhor lance informado acima do meu lance: estou na frente e não preciso cobrir', () => {
    const a = avaliarLance(1450, limites, regras, 1, 1393)
    expect(a.sugestao).toBeNull()
    expect(a.valor).toBe(1393)
    expect(a.mensagem).toContain('você continua na frente')
    expect(avaliarLance(1380, limites, regras, 1, 1393).sugestao).not.toBeNull()
  })

  it('sem custos, não inventa margem', () => {
    const a = avaliarLance(1400, { ...limites, custoComRateio: 0 }, regras, 0)
    expect(a.sugestao).toBeNull()
    expect(a.mensagem).toContain('Preencha os custos')
  })

  it('o exemplo da página de entrada bate com a conta do produto (margem sobre o preço)', () => {
    const exemplo = { custoComRateio: 2620.65, impostosPct: 0, margemDesejadaPct: 15 }
    expect(limitesDoAlvo(exemplo).minimoComMargem).toBe(3083.12)
    expect(avaliarLance(3112, exemplo, { decrementoPct: 0.5, maxLances: 5 }, 0).sugestao).toEqual({ valor: 3096.44, margemPct: 15.4, ultimo: false })
    expect(Math.round(((3380 - 2620.65) / 3380) * 1000) / 10).toBe(22.5)
  })
})
