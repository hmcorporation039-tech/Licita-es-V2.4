import { beforeEach, describe, expect, it } from 'vitest'
import { DadosDoEstudo, FATOR_ESTRADA, ItemDaLicitacao, calcularEstudo, dadosIniciais, lerPrazoEmDias, precoMinimoComMargem } from '../src/lib/estudoDeCustos'
import { limitesDoAlvo } from '../src/lib/bela/copiloto'
import { estatisticasDePrecos, estatisticasPorUnidade, normalizarRegistroDePreco, normalizarUnidade } from '../src/lib/precosDeMercado'
import { limparCachePrecos, pesquisarPrecos, PrecosIndisponiveisError } from '../src/services/pesquisaDePrecosService'
import { gerarPdfDoEstudo } from '../src/services/estudoPdf'

const item = (id: string, qtd: number, estimado: number | null = null): ItemDaLicitacao => ({
  id,
  numero: 1,
  descricao: `Item ${id}`,
  unidade: 'UN',
  quantidade: qtd,
  valorEstimadoUnit: estimado,
})
const ctx: { distanciaLinhaRetaKm: number | null; valorEstimadoTotal: number | null } = { distanciaLinhaRetaKm: null, valorEstimadoTotal: null }
const dados = (extra: Partial<DadosDoEstudo> = {}): DadosDoEstudo => ({ ...dadosIniciais(), margemDesejadaPct: 10, ...extra })

describe('calcularEstudo: lucro, impostos e preço mínimo', () => {
  const itens = [item('a', 10), item('b', 5)]
  const base = dados({
    itens: { a: { custoUnit: 100, precoVendaUnit: 150 }, b: { custoUnit: 200, precoVendaUnit: 260 } },
    impostosPct: 10,
  })

  it('receita, custos e lucro batem com a conta feita à mão', () => {
    const r = calcularEstudo(itens, base, ctx)
    expect(r.receita).toBe(10 * 150 + 5 * 260) // 2800
    expect(r.custoItens).toBe(10 * 100 + 5 * 200) // 2000
    expect(r.impostos).toBe(280) // 10% da receita
    expect(r.custoTotal).toBe(2280)
    expect(r.lucro).toBe(520)
    expect(r.margemPct).toBe(18.57)
  })

  it('preço mínimo: vender nele dá exatamente a margem desejada', () => {
    const r = calcularEstudo(itens, base, ctx)
    // base 2000 / (1 - 0,10 - 0,10) = 2500
    expect(r.receitaMinima).toBe(2500)
    const minimo = r.cenarios.find((c) => c.nome.startsWith('No preço mínimo'))!
    expect(minimo.margemPct).toBe(10)
    expect(minimo.lucro).toBe(250)
    // preço mínimo unitário: 100 / 0,8 = 125 e 200 / 0,8 = 250
    expect(r.itens.map((l) => l.precoMinimoUnit)).toEqual([125, 250])
  })

  it('custos de deslocamento e outros são rateados no preço mínimo unitário', () => {
    const r = calcularEstudo(itens, { ...base, outrosCustos: [{ descricao: 'frete', valor: 400 }] }, ctx)
    // base 2400; rateio = 1 + 400/2000 = 1,2 ; mínimo do item a = 100*1,2/0,8 = 150
    expect(r.receitaMinima).toBe(3000)
    expect(r.itens[0].precoMinimoUnit).toBe(150)
    // somando o mínimo de todos os itens, chega-se à receita mínima
    expect(10 * r.itens[0].precoMinimoUnit! + 5 * r.itens[1].precoMinimoUnit!).toBe(3000)
  })

  it('prejuízo aparece com sinal negativo e margem negativa', () => {
    const r = calcularEstudo([item('a', 1)], dados({ itens: { a: { custoUnit: 100, precoVendaUnit: 80 } } }), ctx)
    expect(r.lucro).toBe(-20)
    expect(r.margemPct).toBe(-25)
  })

  it('impostos + margem >= 100% não têm preço possível, e o sistema avisa', () => {
    const r = calcularEstudo(itens, { ...base, impostosPct: 60, margemDesejadaPct: 40 }, ctx)
    expect(r.receitaMinima).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/100%/)
  })

  it('sem custos informados não finge lucro: avisa', () => {
    const r = calcularEstudo(itens, dados(), ctx)
    expect(r.avisos.join(' ')).toMatch(/sem custo informado/)
    expect(r.avisos.join(' ')).toMatch(/Informe os custos/)
  })

  it('cenários: valor estimado e mediana de mercado', () => {
    const its = [item('a', 10, 200)]
    const d = dados({
      itens: { a: { custoUnit: 100, precoVendaUnit: null } },
      mercado: { a: { mediana: 180, minimo: 120, maximo: 300, amostras: 9, uf: null, meses: 12, consultadoEm: '2026-10-05T10:00:00Z' } },
    })
    const r = calcularEstudo(its, d, ctx)
    expect(r.cenarios.find((c) => c.nome.includes('estimado'))).toMatchObject({ receita: 2000, lucro: 1000 })
    expect(r.cenarios.find((c) => c.nome.includes('mediana'))).toMatchObject({ receita: 1800, lucro: 800 })
  })
})

describe('calcularEstudo: resultado no valor estimado pelo órgão', () => {
  it('custo + impostos acima do estimado NÃO é prejuízo se no estimado ainda sobra lucro', () => {
    const r = calcularEstudo(
      [item('a', 1, 1000)],
      dados({ itens: { a: { custoUnit: 900, precoVendaUnit: 2000 } }, impostosPct: 6 }),
      ctx
    )
    expect(r.custoTotal).toBe(1020)
    expect(r.custosSemImpostos).toBe(900)
    expect(r.estimadoPeloOrgao).toBe(1000)
    expect(r.resultadoNoEstimado).toBe(40)
    expect(r.cenarios.find((c) => c.nome.includes('estimado'))!.lucro).toBe(r.resultadoNoEstimado)
  })

  it('custo + impostos abaixo do estimado, mas prejuízo no estimado: alerta (antes passava despercebido)', () => {
    const r = calcularEstudo(
      [item('a', 1, 1000)],
      dados({ itens: { a: { custoUnit: 950, precoVendaUnit: 400 } }, impostosPct: 10 }),
      ctx
    )
    expect(r.custoTotal).toBe(990)
    expect(r.resultadoNoEstimado).toBe(-50)
  })

  it('sem estimado nos itens usa o valor total da licitação; sem nenhum, não há resultado no estimado', () => {
    const semUnit = calcularEstudo([item('a', 2)], dados({ itens: { a: { custoUnit: 100, precoVendaUnit: null } } }), { ...ctx, valorEstimadoTotal: 150 })
    expect(semUnit).toMatchObject({ estimadoPeloOrgao: 150, resultadoNoEstimado: -50 })
    const nada = calcularEstudo([item('a', 2)], dados({ itens: { a: { custoUnit: 100, precoVendaUnit: null } } }), ctx)
    expect(nada).toMatchObject({ estimadoPeloOrgao: null, resultadoNoEstimado: null })
  })

  it('custos sem impostos não mudam quando o preço de venda sobe; só os impostos sobem', () => {
    const com = (preco: number) => calcularEstudo([item('a', 10)], dados({ itens: { a: { custoUnit: 100, precoVendaUnit: preco } }, impostosPct: 10 }), ctx)
    expect(com(150).custosSemImpostos).toBe(com(300).custosSemImpostos)
    expect(com(300).impostos).toBeGreaterThan(com(150).impostos)
  })
})

describe('calcularEstudo: preço mínimo por item e avisos', () => {
  it('mínimo unitário arredonda para cima: unidades x quantidade cobrem a receita mínima', () => {
    const its = [item('a', 3), item('b', 7)]
    const r = calcularEstudo(its, dados({ itens: { a: { custoUnit: 10, precoVendaUnit: null }, b: { custoUnit: 3.33, precoVendaUnit: null } }, margemDesejadaPct: 7 }), ctx)
    expect(r.itens[0].precoMinimoUnit).toBe(10.76)
    expect(r.itens[1].precoMinimoUnit).toBe(3.59)
    const somaDosMinimos = 3 * r.itens[0].precoMinimoUnit! + 7 * r.itens[1].precoMinimoUnit!
    expect(somaDosMinimos).toBeGreaterThanOrEqual(r.receitaMinima!)
  })

  it('o "seu mínimo" do pregão é o mesmo mínimo unitário do estudo, centavo a centavo', () => {
    const its = [item('a', 3), item('b', 7), item('c', 2)]
    const d = dados({
      itens: { a: { custoUnit: 10, precoVendaUnit: null }, b: { custoUnit: 3.33, precoVendaUnit: null }, c: { custoUnit: 401.99, precoVendaUnit: null } },
      outrosCustos: [{ descricao: 'frete', valor: 37.41 }],
      impostosPct: 6.5,
      margemDesejadaPct: 7,
    })
    const r = calcularEstudo(its, d, ctx)
    const rateio = 1 + (r.custoDeslocamento + r.custoOutros) / r.custoItens
    for (const [i, id] of (['a', 'b', 'c'] as const).entries()) {
      const doPregao = limitesDoAlvo({ custoComRateio: d.itens[id].custoUnit! * rateio, impostosPct: d.impostosPct, margemDesejadaPct: d.margemDesejadaPct }).minimoComMargem
      expect(doPregao).toBe(r.itens[i].precoMinimoUnit)
    }
    expect(limitesDoAlvo({ custoComRateio: r.custoItens + r.custoDeslocamento + r.custoOutros, impostosPct: 6.5, margemDesejadaPct: 7 }).minimoComMargem).toBe(r.receitaMinima)
    expect(precoMinimoComMargem(3.33, 0, 7)).toBe(3.59)
    expect(limitesDoAlvo({ custoComRateio: 3.33, impostosPct: 0, margemDesejadaPct: 7 }).minimoComMargem).toBe(3.59)
  })

  it('valor exato não sobe um centavo à toa', () => {
    const r = calcularEstudo([item('a', 10)], dados({ itens: { a: { custoUnit: 100, precoVendaUnit: null } }, outrosCustos: [{ descricao: 'frete', valor: 200 }], impostosPct: 10 }), ctx)
    expect(r.itens[0].precoMinimoUnit).toBe(150)
  })

  it('avisa quando a quantidade não veio do edital e foi considerada 1', () => {
    const r = calcularEstudo([{ ...item('a', 1), quantidadeAssumida: true }], dados({ itens: { a: { custoUnit: 10, precoVendaUnit: 20 } } }), ctx)
    expect(r.avisos.join(' ')).toMatch(/sem quantidade no edital/)
  })

  it('avisa quando o preço de mercado está em unidade diferente da licitação', () => {
    const mercado = { mediana: 31, minimo: 30, maximo: 35, amostras: 4, uf: null, meses: 12, consultadoEm: '2026-10-05T10:00:00Z', unidade: 'CX', unidadeConfere: false }
    const r = calcularEstudo([item('a', 1)], dados({ itens: { a: { custoUnit: 10, precoVendaUnit: 20 } }, mercado: { a: mercado } }), ctx)
    expect(r.avisos.join(' ')).toMatch(/unidade diferente/)
  })
})

describe('calcularEstudo: deslocamento', () => {
  const its = [item('a', 1)]
  const com = (d: Partial<DadosDoEstudo['deslocamento']>, c = ctx) =>
    calcularEstudo(its, dados({ itens: { a: { custoUnit: 10, precoVendaUnit: 20 } }, deslocamento: { ...dadosIniciais().deslocamento, ...d } }), c)

  it('estima pela linha reta x 1,3, ida e volta, vezes as viagens', () => {
    const r = com({ valorPorKm: 2, viagens: 3, pedagioPorViagem: 50 }, { ...ctx, distanciaLinhaRetaKm: 100 })
    expect(r.deslocamento).toMatchObject({ origem: 'estimado', kmIda: Math.round(100 * FATOR_ESTRADA), kmIdaEVolta: 260 })
    expect(r.deslocamento.custoPorViagem).toBe(260 * 2 + 50) // 570
    expect(r.custoDeslocamento).toBe(1710)
  })

  it('o quilômetro informado vale mais que a estimativa', () => {
    const r = com({ kmIdaInformado: 500, valorPorKm: 1 }, { ...ctx, distanciaLinhaRetaKm: 100 })
    expect(r.deslocamento).toMatchObject({ origem: 'informado', kmIda: 500, custoPorViagem: 1000 })
  })

  it('sem base e sem km: avisa e cobra só pedágio/hospedagem', () => {
    const r = com({ valorPorKm: 2, pedagioPorViagem: 30, hospedagemPorViagem: 120 })
    expect(r.deslocamento.origem).toBe('indisponivel')
    expect(r.custoDeslocamento).toBe(150)
    expect(r.avisos.join(' ')).toMatch(/base da empresa/)
  })

  it('combustível: km de ida e volta dividido pelo consumo, vezes o preço do litro', () => {
    const r = com({ kmIdaInformado: 1112, precoLitro: 6, consumoKmPorLitro: 10 })
    expect(r.deslocamento).toMatchObject({ kmIdaEVolta: 2224, litrosPorViagem: 222.4, combustivelPorViagem: 1334.4, custoPorViagem: 1334.4 })
    expect(r.custoDeslocamento).toBe(1334.4)
    expect(r.avisos.join(' ')).not.toMatch(/outro custo por km/)
  })

  it('combustível soma com pedágio, hospedagem e outro custo por km, vezes as viagens', () => {
    const r = com({ kmIdaInformado: 100, precoLitro: 5, consumoKmPorLitro: 8, valorPorKm: 0.5, pedagioPorViagem: 20, hospedagemPorViagem: 150, viagens: 2 })
    expect(r.deslocamento.combustivelPorViagem).toBe(125)
    expect(r.deslocamento.custoPorViagem).toBe(125 + 100 + 20 + 150)
    expect(r.custoDeslocamento).toBe(790)
  })

  it('preço do litro sem consumo não inventa combustível e pede o consumo', () => {
    const r = com({ kmIdaInformado: 100, precoLitro: 6 })
    expect(r.deslocamento).toMatchObject({ litrosPorViagem: null, combustivelPorViagem: 0 })
    expect(r.avisos.join(' ')).toMatch(/consumo do veículo/)
  })

  it('avisa quando o custo por km parece ser o preço do litro', () => {
    const r = com({ kmIdaInformado: 1112, valorPorKm: 6 })
    expect(r.custoDeslocamento).toBe(13344)
    expect(r.avisos.join(' ')).toMatch(/preço do litro/)
  })
})

describe('calcularEstudo: prazo', () => {
  const its = [item('a', 1)]
  const com = (prazo: Partial<DadosDoEstudo['prazo']>, km: number | null = 1000) =>
    calcularEstudo(
      its,
      dados({
        itens: { a: { custoUnit: 10, precoVendaUnit: 20 } },
        deslocamento: { ...dadosIniciais().deslocamento, kmIdaInformado: km },
        prazo: { ...dadosIniciais().prazo, ...prazo },
      }),
      ctx
    )

  it('preparo + transporte (500 km/dia) contra o prazo do edital', () => {
    const r = com({ exigidoDias: 20, preparoDias: 10 }) // transporte 2 dias, precisa 12, folga 8
    expect(r.prazo).toMatchObject({ diasDeTransporte: 2, diasNecessarios: 12, folgaDias: 8, situacao: 'ok' })
  })
  it('apertado (folga até 2 dias) e inviável (folga negativa)', () => {
    expect(com({ exigidoDias: 14, preparoDias: 10 }).prazo.situacao).toBe('apertado')
    const inviavel = com({ exigidoDias: 5, preparoDias: 10 })
    expect(inviavel.prazo).toMatchObject({ situacao: 'inviavel', folgaDias: -7 })
    expect(inviavel.avisos.join(' ')).toMatch(/Prazo inviável/)
  })
  it('sem prazo no edital não inventa situação', () => {
    expect(com({ exigidoDias: null }).prazo.situacao).toBeNull()
  })
  it('datas: corridos somam dias diretos; úteis pulam fim de semana', () => {
    const corridos = com({ exigidoDias: 10, preparoDias: 3, assinatura: '2026-10-05' }, 0)
    expect(corridos.prazo).toMatchObject({ dataLimite: '2026-10-15', dataEntregaPrevista: '2026-10-08' })
    const uteis = com({ exigidoDias: 5, exigidoEmDiasUteis: true, preparoDias: 1, assinatura: '2026-10-02' }, 0) // sexta
    expect(uteis.prazo.dataLimite).toBe('2026-10-09') // sex 02 + 5 dias úteis = sex 09
    expect(uteis.prazo.dataEntregaPrevista).toBe('2026-10-05') // 1 dia útil depois da sexta = segunda
  })
})

describe('lerPrazoEmDias', () => {
  it('lê dias, dias úteis e meses; devolve null quando não há número claro', () => {
    expect(lerPrazoEmDias('30 dias')).toEqual({ dias: 30, uteis: false })
    expect(lerPrazoEmDias('Até 10 (dez) dias úteis após a ordem de fornecimento')).toEqual({ dias: 10, uteis: true })
    expect(lerPrazoEmDias('45 dias corridos')).toEqual({ dias: 45, uteis: false })
    expect(lerPrazoEmDias('2 meses')).toEqual({ dias: 60, uteis: false })
    expect(lerPrazoEmDias('imediato')).toBeNull()
    expect(lerPrazoEmDias(null)).toBeNull()
  })

  it('"N dias" vale mais que a vigência em meses (antes: 360 dias)', () => {
    expect(lerPrazoEmDias('5 dias úteis após o pedido, durante a vigência de 12 meses')).toEqual({ dias: 5, uteis: true })
    expect(lerPrazoEmDias('Vigência de 12 (doze) meses; entrega em até 30 (trinta) dias corridos')).toEqual({ dias: 30, uteis: false })
  })

  it('prazos diferentes no mesmo texto são ambíguos: devolve null', () => {
    expect(lerPrazoEmDias('Entrega em 5 dias úteis, prorrogáveis por mais 10 dias')).toBeNull()
    expect(lerPrazoEmDias('Vigência de 12 meses, podendo chegar a 60 meses')).toBeNull()
  })

  it('o mesmo prazo repetido não é ambíguo', () => {
    expect(lerPrazoEmDias('Prazo de 10 (dez) dias úteis. A entrega deve ocorrer em até 10 dias.')).toEqual({ dias: 10, uteis: true })
  })
})

describe('preços de mercado por unidade de fornecimento', () => {
  const compra = (precoUnitario: number, unidade: string | null) => ({ precoUnitario, quantidade: 1, data: '2026-01-10', orgao: 'O', uf: 'GO', fornecedor: 'F', unidade })
  const misturado = [compra(0.3, 'UN'), compra(0.32, 'UNIDADE'), compra(0.35, 'UNID'), compra(0.31, 'UN'), compra(30, 'CX'), compra(32, 'CAIXA'), compra(35, 'CAIXA 100,00 UN'), compra(31, 'CX')]

  it('normaliza sinônimos de unidade', () => {
    expect(['UN', 'UNID', 'Unidade', 'und'].map(normalizarUnidade)).toEqual(['UN', 'UN', 'UN', 'UN'])
    expect(['CX', 'CAIXA', 'Caixa 100,00 UN'].map(normalizarUnidade)).toEqual(['CX', 'CX', 'CX'])
    expect(['PCT', 'PACOTE', 'KG', 'QUILOGRAMA', 'L', 'LITRO', 'M', 'METRO', 'M²'].map(normalizarUnidade)).toEqual(['PCT', 'PCT', 'KG', 'KG', 'L', 'L', 'M', 'M', 'M2'])
    expect(normalizarUnidade(null)).toBeNull()
  })

  it('não mistura unidade e caixa: mediana 0,32 por UN (antes: 15,18)', () => {
    expect(estatisticasDePrecos(misturado.map((c) => c.precoUnitario))!.mediana).toBe(15.18)
    const r = estatisticasPorUnidade(misturado, 'UNIDADE')
    expect(r).toMatchObject({ unidade: 'UN', unidadeConfere: true })
    expect(r.estatisticas).toMatchObject({ amostras: 4, mediana: 0.32, minimo: 0.3, maximo: 0.35 })
    expect(estatisticasPorUnidade(misturado, 'Caixa').estatisticas).toMatchObject({ mediana: 31.5, amostras: 4 })
  })

  it('sem grupo compatível usa o maior grupo e sinaliza', () => {
    const r = estatisticasPorUnidade([...misturado, compra(33, 'CX')], 'KG')
    expect(r).toMatchObject({ unidade: 'CX', unidadeConfere: false })
    expect(r.estatisticas!.amostras).toBe(5)
    expect(r.unidades[0]).toEqual({ unidade: 'CX', amostras: 5 })
  })

  it('item sem unidade: maior grupo, sem afirmar que confere', () => {
    expect(estatisticasPorUnidade(misturado.slice(0, 5), null)).toMatchObject({ unidade: 'UN', unidadeConfere: null })
    expect(estatisticasPorUnidade([], 'UN')).toMatchObject({ estatisticas: null, unidade: null })
  })
})

describe('preços de mercado', () => {
  it('estatísticas básicas', () => {
    const e = estatisticasDePrecos([10, 20, 30, 40, 50])!
    expect(e).toMatchObject({ amostras: 5, minimo: 10, mediana: 30, maximo: 50, media: 30, descartados: 0 })
  })
  it('descarta valor absurdo (câmera a R$ 1,3 milhão) quando há amostra suficiente', () => {
    const e = estatisticasDePrecos([100, 110, 120, 130, 140, 150, 160, 170, 1_300_000])!
    expect(e.descartados).toBe(1)
    expect(e.maximo).toBe(170)
  })
  it('amostra pequena não descarta nada; vazio e inválidos viram null', () => {
    expect(estatisticasDePrecos([1, 1_000_000])!.descartados).toBe(0)
    expect(estatisticasDePrecos([])).toBeNull()
    expect(estatisticasDePrecos([0, -5, NaN])).toBeNull()
  })
  it('normaliza o registro do Compras.gov.br e ignora preço inválido', () => {
    const r = normalizarRegistroDePreco({
      precoUnitario: 12.5,
      quantidade: 3,
      dataResultado: '2025-10-08T00:00',
      nomeOrgao: 'ÓRGÃO X',
      estado: 'RJ',
      nomeFornecedor: 'F',
      siglaUnidadeFornecimento: 'UN',
    })!
    expect(r).toMatchObject({ precoUnitario: 12.5, quantidade: 3, data: '2025-10-08', uf: 'RJ', orgao: 'ÓRGÃO X' })
    expect(normalizarRegistroDePreco({ precoUnitario: 0 })).toBeNull()
    expect(normalizarRegistroDePreco(null)).toBeNull()
  })
})

describe('pesquisarPrecos (API falsa)', () => {
  beforeEach(() => limparCachePrecos())
  const registro = (p: number, data = '2026-01-10') => ({ precoUnitario: p, quantidade: 1, dataResultado: data, nomeOrgao: 'O', estado: 'GO' })

  it('material e serviço usam endpoints e parâmetros diferentes; envia período e UF; cacheia', async () => {
    const chamadas: { url: string; p: Record<string, string | number> }[] = []
    const buscar = async (url: string, p: Record<string, string | number>) => {
      chamadas.push({ url, p })
      return { resultado: [registro(10), registro(20), registro(30)], totalRegistros: 3, totalPaginas: 1 }
    }
    const agora = new Date('2026-10-05T12:00:00Z')
    const m = await pesquisarPrecos({ tipo: 'MATERIAL', codigo: '150.227', uf: 'go', meses: 12 }, { buscar, agora })
    expect(chamadas[0].url).toMatch(/1_consultarMaterial$/)
    expect(chamadas[0].p).toMatchObject({ tipo: 'codigoItemCatalogo', codigo: '150227', estado: 'GO', dataCompraInicio: '2025-10-05', dataCompraFim: '2026-10-05', tamanhoPagina: 500 })
    expect(m.estatisticas?.mediana).toBe(20)
    await pesquisarPrecos({ tipo: 'SERVICO', codigo: '14850' }, { buscar, agora })
    expect(chamadas[1].url).toMatch(/3_consultarServico$/)
    expect(chamadas[1].p).toMatchObject({ codigoItemCatalogo: '14850' })
    expect(chamadas[1].p).not.toHaveProperty('estado')
    await pesquisarPrecos({ tipo: 'MATERIAL', codigo: '150227', uf: 'GO', meses: 12 }, { buscar, agora })
    expect(chamadas).toHaveLength(2) // a repetição veio do cache
  })

  it('agrupa por unidade de fornecimento e devolve a unidade junto da mediana', async () => {
    const comUnidade = (p: number, siglaUnidadeFornecimento: string) => ({ ...registro(p), siglaUnidadeFornecimento })
    const buscar = async () => ({
      resultado: [comUnidade(0.3, 'UN'), comUnidade(0.32, 'UN'), comUnidade(0.35, 'UNIDADE'), comUnidade(0.31, 'UN'), comUnidade(30, 'CX'), comUnidade(32, 'CX'), comUnidade(35, 'CAIXA'), comUnidade(31, 'CX')],
      totalRegistros: 8,
      totalPaginas: 1,
    })
    const r = await pesquisarPrecos({ tipo: 'MATERIAL', codigo: '999', unidade: 'Unidade' }, { buscar })
    expect(r).toMatchObject({ unidade: 'UN', unidadeConfere: true, totalDeCompras: 8 })
    expect(r.estatisticas?.mediana).toBe(0.32)
    expect(r.recentes.every((c) => c.precoUnitario < 1)).toBe(true)
    const emCaixa = await pesquisarPrecos({ tipo: 'MATERIAL', codigo: '999', unidade: 'CX' }, { buscar })
    expect(emCaixa.estatisticas?.mediana).toBe(31.5)
  })

  it('tenta de novo uma vez e depois dá erro claro', async () => {
    let n = 0
    const falha = async () => {
      n++
      throw new Error('x')
    }
    await expect(pesquisarPrecos({ tipo: 'MATERIAL', codigo: '1' }, { buscar: falha })).rejects.toBeInstanceOf(PrecosIndisponiveisError)
    expect(n).toBe(2)
  })
})

describe('PDF do estudo', () => {
  it('gera um PDF válido com acentos e várias páginas de itens, sem lançar erro', async () => {
    const itens = Array.from({ length: 60 }, (_, i) => ({
      ...item(`i${i}`, i + 1, 100),
      numero: i + 1,
      descricao: `Pavimentação asfáltica — conservação e manutenção número ${i}`,
      codigoCatalogo: '150227',
    }))
    const d = dados({
      itens: Object.fromEntries(itens.map((it) => [it.id, { custoUnit: 50, precoVendaUnit: 90 }])),
      impostosPct: 8,
      outrosCustos: [{ descricao: 'Instalação', valor: 1500 }],
      deslocamento: { kmIdaInformado: 300, viagens: 2, valorPorKm: 1.8, precoLitro: 0, consumoKmPorLitro: 0, pedagioPorViagem: 40, hospedagemPorViagem: 0 },
      prazo: { exigidoDias: 30, exigidoEmDiasUteis: false, preparoDias: 10, assinatura: '2026-10-20' },
      mercado: { i0: { mediana: 95, minimo: 70, maximo: 140, amostras: 12, uf: 'GO', meses: 12, consultadoEm: '2026-10-05T10:00:00Z' } },
    })
    const resultado = calcularEstudo(itens, d, ctx)
    const pdf = await gerarPdfDoEstudo({
      empresa: { nome: 'Construtora São João Ltda', documento: '12345678000190', base: 'Goiânia/GO' },
      dossie: null,
      licitacao: {
        objeto: 'Contratação de serviços de manutenção',
        orgao: 'Prefeitura de Anápolis',
        local: 'Anápolis/GO',
        modalidade: 'PREGAO_ELETRONICO',
        fonte: 'PNCP',
        numeroControle: '123-1-000001/2026',
        valorEstimado: 500000,
        sessaoEm: new Date('2026-11-10T13:00:00Z'),
        linkEdital: 'https://pncp.gov.br/x',
      },
      itens,
      dados: d,
      resultado,
      geradoEm: new Date('2026-10-05T15:00:00Z'),
      geradoPor: 'Márcio',
    })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(5000)
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  })
})
