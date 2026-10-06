import { beforeEach, describe, expect, it } from 'vitest'
import { DadosDoEstudo, FATOR_ESTRADA, ItemDaLicitacao, calcularEstudo, dadosIniciais, lerPrazoEmDias } from '../src/lib/estudoDeCustos'
import { estatisticasDePrecos, normalizarRegistroDePreco } from '../src/lib/precosDeMercado'
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
      deslocamento: { kmIdaInformado: 300, viagens: 2, valorPorKm: 1.8, pedagioPorViagem: 40, hospedagemPorViagem: 0 },
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
