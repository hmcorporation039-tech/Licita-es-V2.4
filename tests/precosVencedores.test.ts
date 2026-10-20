import { describe, expect, it } from 'vitest'
import {
  CasoVencedor,
  casosRecentes,
  descontoMedianoPct,
  escolherCriterio,
  estatisticasDosVencedores,
  precisaBuscarPorDescricao,
  precosVencedoresDoItem,
  quemMaisVence,
  inicioDoHistorico,
  descricaoParaComparar,
} from '../src/lib/precosVencedores'
import { formatarDocumentoDoFornecedor } from '../src/lib/documentoDoFornecedor'
import {
  acimaDoQueCostumaVencer,
  referenciaParaOPregao,
  textoDaReferencia,
  textoDoCriterio,
  type PrecosVencedoresDoItem as PrecosNaTela,
} from '../web/src/lib/precosVencedores'

function caso(extra: Partial<CasoVencedor> = {}): CasoVencedor {
  return {
    orgao: 'Prefeitura de Anápolis',
    municipio: 'Anápolis',
    uf: 'GO',
    dataDoResultado: '2026-05-10',
    descricao: 'Caneta esferográfica azul',
    unidade: 'UN',
    quantidade: 100,
    precoUnitario: 1.5,
    precoEstimado: 2,
    vencedorNi: '52112156000168',
    vencedorNome: 'Papelaria Central LTDA',
    vencedorPorte: 'ME',
    ...extra,
  }
}

describe('estatísticas do preço unitário vencedor', () => {
  it('usa a mediana e a faixa dos casos com a mesma unidade do item', () => {
    const casos = [1, 2, 3, 4, 5].map((p) => caso({ precoUnitario: p, unidade: 'Unidade' }))
    const r = estatisticasDosVencedores(casos, 'UN')
    expect(r.unidadeConfere).toBe(true)
    expect(r.unidade).toBe('UN')
    expect(r.estatisticas).toMatchObject({ amostras: 5, minimo: 1, mediana: 3, maximo: 5 })
  })

  it('quando a unidade do item não aparece nos casos, informa que a unidade difere', () => {
    const casos = [10, 11, 12].map((p) => caso({ precoUnitario: p, unidade: 'Caixa' }))
    const r = estatisticasDosVencedores(casos, 'UN')
    expect(r.unidadeConfere).toBe(false)
    expect(r.unidade).toBe('CX')
    expect(r.estatisticas?.mediana).toBe(11)
  })

  it('compara só com a unidade compatível quando há unidades misturadas', () => {
    const casos = [
      ...[1, 1.2, 1.4].map((p) => caso({ precoUnitario: p, unidade: 'UND' })),
      ...[50, 55, 60, 65].map((p) => caso({ precoUnitario: p, unidade: 'CX' })),
    ]
    const r = estatisticasDosVencedores(casos, 'unidade')
    expect(r.unidadeConfere).toBe(true)
    expect(r.estatisticas).toMatchObject({ amostras: 3, mediana: 1.2 })
  })

  it('sem 3 casos da unidade escolhida, não calcula estatística', () => {
    const casos = [caso({ unidade: 'UN' }), caso({ unidade: 'UN' }), caso({ unidade: 'KG' })]
    expect(estatisticasDosVencedores(casos, 'UN').estatisticas).toBeNull()
  })

  it('sem unidade no item, a conferência fica indefinida', () => {
    const casos = [1, 2, 3].map((p) => caso({ precoUnitario: p }))
    expect(estatisticasDosVencedores(casos, null).unidadeConfere).toBeNull()
  })
})

describe('desconto mediano em relação ao estimado', () => {
  it('calcula 1 − homologado/estimado e devolve a mediana em %', () => {
    const casos = [
      caso({ precoUnitario: 90, precoEstimado: 100 }),
      caso({ precoUnitario: 80, precoEstimado: 100 }),
      caso({ precoUnitario: 70, precoEstimado: 100 }),
    ]
    expect(descontoMedianoPct(casos)).toBe(20)
  })

  it('descarta estimado ausente ou zero e homologado zero', () => {
    const casos = [
      caso({ precoUnitario: 90, precoEstimado: 100 }),
      caso({ precoUnitario: 50, precoEstimado: null }),
      caso({ precoUnitario: 50, precoEstimado: 0 }),
      caso({ precoUnitario: 0, precoEstimado: 100 }),
    ]
    expect(descontoMedianoPct(casos)).toBe(10)
  })

  it('descarta erro de cadastro: desconto acima de 95% ou abaixo de −50%', () => {
    const casos = [
      caso({ precoUnitario: 1, precoEstimado: 1000 }),
      caso({ precoUnitario: 200, precoEstimado: 100 }),
      caso({ precoUnitario: 95, precoEstimado: 100 }),
      caso({ precoUnitario: 85, precoEstimado: 100 }),
    ]
    expect(descontoMedianoPct(casos)).toBe(10)
  })

  it('aceita os limites: −50% e 95%', () => {
    expect(descontoMedianoPct([caso({ precoUnitario: 150, precoEstimado: 100 })])).toBe(-50)
    expect(descontoMedianoPct([caso({ precoUnitario: 5, precoEstimado: 100 })])).toBe(95)
  })

  it('sem nenhum caso aproveitável, devolve nulo', () => {
    expect(descontoMedianoPct([caso({ precoEstimado: null })])).toBeNull()
  })
})

describe('quem mais vence', () => {
  it('ordena por número de vitórias, até 5, com CNPJ formatado', () => {
    const casos = [
      ...Array.from({ length: 3 }, () => caso({ vencedorNi: '11.222.333/0001-81', vencedorNome: 'Alfa LTDA', vencedorPorte: 'EPP' })),
      ...Array.from({ length: 2 }, () => caso({ vencedorNi: '52112156000168', vencedorNome: 'Beta LTDA' })),
      caso({ vencedorNi: '00000000000191', vencedorNome: 'Gama' }),
      caso({ vencedorNi: '00000000000272', vencedorNome: 'Delta' }),
      caso({ vencedorNi: '00000000000353', vencedorNome: 'Épsilon' }),
      caso({ vencedorNi: '00000000000434', vencedorNome: 'Zeta' }),
    ]
    const r = quemMaisVence(casos)
    expect(r).toHaveLength(5)
    expect(r[0]).toEqual({ nome: 'Alfa LTDA', porte: 'EPP', documento: '11.222.333/0001-81', vitorias: 3 })
    expect(r[1]).toMatchObject({ nome: 'Beta LTDA', documento: '52.112.156/0001-68', vitorias: 2 })
  })

  it('mascara o CPF de pessoa física como na tela de resultado', () => {
    const r = quemMaisVence([caso({ vencedorNi: '12345678901', vencedorNome: 'José da Silva', vencedorPorte: null })])
    expect(r[0].documento).toBe('***.456.789-**')
    expect(JSON.stringify(r)).not.toContain('12345678901')
  })

  it('a máscara comum é a mesma da tela de resultado', async () => {
    const daTela = await import('../web/src/lib/resultadoDaLicitacao')
    for (const ni of ['12345678901', '52112156000168', 'EX-123', null]) {
      expect(formatarDocumentoDoFornecedor(ni)).toBe(daTela.formatarDocumentoDoFornecedor(ni))
    }
  })

  it('no empate, fica na frente quem venceu mais recentemente', () => {
    const r = quemMaisVence([
      caso({ vencedorNi: '00000000000191', vencedorNome: 'Antiga', dataDoResultado: '2025-01-01' }),
      caso({ vencedorNi: '00000000000272', vencedorNome: 'Recente', dataDoResultado: '2026-09-01' }),
    ])
    expect(r.map((f) => f.nome)).toEqual(['Recente', 'Antiga'])
  })
})

describe('escolha do critério', () => {
  const tres = [caso(), caso(), caso()]

  it('com 3 casos ou mais pelo código, usa o código', () => {
    expect(escolherCriterio({ temCodigo: true, porCodigo: tres, porDescricao: null })).toMatchObject({ criterio: 'codigo', casos: tres })
    expect(precisaBuscarPorDescricao(true, 3)).toBe(false)
  })

  it('código com menos de 3 casos cai para a descrição', () => {
    expect(precisaBuscarPorDescricao(true, 2)).toBe(true)
    const porDescricao = [caso(), caso(), caso(), caso()]
    expect(escolherCriterio({ temCodigo: true, porCodigo: [caso(), caso()], porDescricao })).toMatchObject({ criterio: 'descricao', casos: porDescricao })
  })

  it('sem código, usa a descrição', () => {
    expect(precisaBuscarPorDescricao(false, 0)).toBe(true)
    expect(escolherCriterio({ temCodigo: false, porCodigo: [], porDescricao: tres }).criterio).toBe('descricao')
  })

  it('se a descrição achar menos que o código, fica com o código', () => {
    expect(escolherCriterio({ temCodigo: true, porCodigo: [caso(), caso()], porDescricao: [caso()] }).criterio).toBe('codigo')
  })

  it('sem nenhum caso, o critério é nulo', () => {
    expect(escolherCriterio({ temCodigo: false, porCodigo: [], porDescricao: [] })).toEqual({ criterio: null, casos: [] })
  })
})

describe('resultado por item', () => {
  it('com menos de 3 casos, devolve só a quantidade e o resto vazio', () => {
    const r = precosVencedoresDoItem('item-1', 'UN', { criterio: 'descricao', casos: [caso(), caso()] })
    expect(r).toEqual({ itemId: 'item-1', criterio: 'descricao', amostras: 2, estatisticas: null, unidade: null, unidadeConfere: null, descontoMedianoPct: null, recentes: [], quemMaisVence: [] })
  })

  it('com casos suficientes, traz até 10 recentes do mais novo para o mais antigo, sem documento', () => {
    const casos = Array.from({ length: 12 }, (_, i) => caso({ dataDoResultado: `2026-0${(i % 9) + 1}-1${i % 10}`, vencedorNi: '12345678901' }))
    const r = precosVencedoresDoItem('item-1', 'UN', { criterio: 'codigo', casos })
    expect(r.amostras).toBe(12)
    expect(r.recentes).toHaveLength(10)
    const datas = r.recentes.map((c) => c.dataDoResultado ?? '')
    expect([...datas].sort().reverse()).toEqual(datas)
    expect(JSON.stringify(r.recentes)).not.toContain('12345678901')
    expect(r.recentes[0]).toMatchObject({ orgao: 'Prefeitura de Anápolis', municipio: 'Anápolis', uf: 'GO', precoVencedor: 1.5, precoEstimado: 2, vencedorNome: 'Papelaria Central LTDA', vencedorPorte: 'ME' })
  })

  it('encurta a descrição longa dos casos', () => {
    const [r] = casosRecentes([caso({ descricao: 'x'.repeat(400) })])
    expect(r.descricao.length).toBeLessThanOrEqual(120)
    expect(r.descricao.endsWith('…')).toBe(true)
  })
})

describe('apoio do serviço', () => {
  it('a janela do histórico é de 24 meses', () => {
    expect(inicioDoHistorico(new Date('2026-10-20T12:00:00Z'))).toBe('2024-10-20')
  })

  it('compara pela descrição normalizada e ignora texto curto demais', () => {
    expect(descricaoParaComparar({ descricao: 'Açúcar  Cristal', descricaoNorm: null })).toBe('acucar cristal')
    expect(descricaoParaComparar({ descricao: 'X', descricaoNorm: 'x' })).toBeNull()
  })
})

describe('linha de referência no pregão', () => {
  const doItem = (extra: Partial<PrecosNaTela> = {}): PrecosNaTela => ({
    itemId: 'item-1',
    criterio: 'codigo',
    amostras: 7,
    estatisticas: { amostras: 7, descartados: 0, minimo: 8, p25: 9, mediana: 10, p75: 11, maximo: 12, media: 10 },
    unidade: 'UN',
    unidadeConfere: true,
    descontoMedianoPct: 18.4,
    recentes: [],
    quemMaisVence: [],
    ...extra,
  })

  it('mostra mediana, casos e desconto quando há 3 casos e a unidade confere', () => {
    const ref = referenciaParaOPregao(doItem())
    expect(ref).not.toBeNull()
    expect(textoDaReferencia(ref!).replace(/\u00a0/g, ' ')).toBe('Vencedores parecidos: mediana R$ 10,00/un · 7 casos · mediana 18,4% abaixo do estimado')
  })

  it('some com unidade diferente, sem unidade conferida ou com poucos casos', () => {
    expect(referenciaParaOPregao(doItem({ unidadeConfere: false }))).toBeNull()
    expect(referenciaParaOPregao(doItem({ unidadeConfere: null }))).toBeNull()
    expect(referenciaParaOPregao(doItem({ amostras: 2, estatisticas: null }))).toBeNull()
    expect(referenciaParaOPregao(undefined)).toBeNull()
  })

  it('omite o desconto quando não há e fala "acima" quando o vencedor passou do estimado', () => {
    expect(textoDaReferencia(referenciaParaOPregao(doItem({ descontoMedianoPct: null }))!).replace(/\u00a0/g, ' ')).toBe('Vencedores parecidos: mediana R$ 10,00/un · 7 casos')
    expect(textoDaReferencia(referenciaParaOPregao(doItem({ descontoMedianoPct: -4 }))!)).toContain('mediana 4,0% acima do estimado')
  })

  it('dica neutra quando o lance planejado fica acima da mediana, por unidade', () => {
    const ref = referenciaParaOPregao(doItem())!
    expect(acimaDoQueCostumaVencer({ precoProposto: 12, minimoComMargem: 9, quantidade: 5 }, 'UNITARIO', ref)).toBe(true)
    expect(acimaDoQueCostumaVencer({ precoProposto: 9.5, minimoComMargem: 9, quantidade: 5 }, 'UNITARIO', ref)).toBe(false)
    expect(acimaDoQueCostumaVencer({ precoProposto: 60, minimoComMargem: 45, quantidade: 5 }, 'TOTAL_DO_ITEM', ref)).toBe(true)
    expect(acimaDoQueCostumaVencer({ precoProposto: 45, minimoComMargem: 40, quantidade: 5 }, 'TOTAL_DO_ITEM', ref)).toBe(false)
  })

  it('abaixo do mínimo, nada muda: o aviso de mínimo existente continua mandando', () => {
    const ref = referenciaParaOPregao(doItem())!
    expect(acimaDoQueCostumaVencer({ precoProposto: 11, minimoComMargem: 13, quantidade: 1 }, 'UNITARIO', ref)).toBe(false)
    expect(acimaDoQueCostumaVencer({ precoProposto: null, minimoComMargem: 13, quantidade: 1 }, 'UNITARIO', ref)).toBe(false)
  })

  it('nomeia o critério usado', () => {
    expect(textoDoCriterio('codigo', 'MATERIAL')).toBe('mesmo código CATMAT')
    expect(textoDoCriterio('codigo', 'SERVICO')).toBe('mesmo código CATSER')
    expect(textoDoCriterio('descricao', null)).toBe('descrição parecida')
  })
})
