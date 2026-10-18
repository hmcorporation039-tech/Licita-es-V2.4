import { describe, expect, it } from 'vitest'
import { DadosDoEstudo, ItemDaLicitacao, calcularEstudo, dadosIniciais } from '../src/lib/estudoDeCustos'
import { avaliarLance, limitesDoAlvo, proximoLance } from '../src/lib/bela/copiloto'
import { ALVO_GLOBAL, alvosDoPregao, type CriterioDoPregao } from '../src/lib/alvosDoPregao'
import {
  checklistDaDisputa,
  desatualizado,
  escolhaDe,
  lerPlanoSalvo,
  passoDosLances,
  regrasEfetivas,
  valorFinalMinimo,
} from '../src/lib/bela/planoDeDisputa'
import {
  detectarVedacaoARobo,
  lerIntervaloMinimo,
  lerModoDeDisputa,
  modoDoPncp,
  regrasDoEdital,
  textosDaAnalise,
} from '../src/lib/bela/regrasDoEdital'

const item = (id: string, qtd: number): ItemDaLicitacao => ({ id, numero: 1, descricao: `Item ${id}`, unidade: 'UN', quantidade: qtd, valorEstimadoUnit: null })
const ctx = { distanciaLinhaRetaKm: null, valorEstimadoTotal: null }
const dados = (extra: Partial<DadosDoEstudo> = {}): DadosDoEstudo => ({ ...dadosIniciais(), ...extra })

function referencia(criterio: CriterioDoPregao) {
  const itens = [item('a', 10)]
  const d = dados({ itens: { a: { custoUnit: 7.77, precoVendaUnit: null } }, impostosPct: 8.65, margemDesejadaPct: 10 })
  const resultado = calcularEstudo(itens, d, ctx)
  const alvos = alvosDoPregao(itens, d, resultado, criterio)
  return { resultado, global: alvos.find((a) => a.id === ALVO_GLOBAL)!, doItem: alvos.find((a) => a.id === 'a')! }
}

describe('plano de disputa: valor final mínimo do lance automático', () => {
  it('global: o mesmo mínimo do estudo de custos (95,60) e nunca abaixo do equilíbrio', () => {
    const { resultado, global } = referencia('UNITARIO')
    const v = valorFinalMinimo(global.limites, 'MARGEM')
    expect(resultado.receitaMinima).toBe(95.6)
    expect(v).toMatchObject({ valor: 95.6, minimoComMargem: 95.6, equilibrio: 85.06, lucroZero: false })
  })

  it('por unidade: 9,56, o mínimo unitário do estudo', () => {
    const { resultado, doItem } = referencia('UNITARIO')
    expect(resultado.itens[0].precoMinimoUnit).toBe(9.56)
    expect(valorFinalMinimo(doItem.limites, 'MARGEM')).toMatchObject({ valor: 9.56, equilibrio: 8.51 })
  })

  it('pelo total do item: 95,60, o mínimo unitário vezes a quantidade', () => {
    const { doItem } = referencia('TOTAL_DO_ITEM')
    expect(valorFinalMinimo(doItem.limites, 'MARGEM')).toMatchObject({ valor: 95.6, equilibrio: 85.06 })
  })

  it('a opção pelo ponto de equilíbrio usa o lucro zero do painel', () => {
    const { global, doItem } = referencia('UNITARIO')
    const v = valorFinalMinimo(global.limites, 'EQUILIBRIO')
    expect(v).toMatchObject({ base: 'EQUILIBRIO', valor: 85.06, lucroZero: true })
    expect(v.valor).toBe(limitesDoAlvo(global.limites).equilibrio)
    expect(valorFinalMinimo(doItem.limites, 'EQUILIBRIO').valor).toBe(8.51)
  })

  it('nunca abaixo do equilíbrio, mesmo com margem desejada zero', () => {
    const limites = { custoComRateio: 1000, impostosPct: 10, margemDesejadaPct: 0 }
    const v = valorFinalMinimo(limites, 'MARGEM')
    expect(v.valor!).toBeGreaterThanOrEqual(v.equilibrio!)
  })

  it('sem custos não há valor final mínimo', () => {
    expect(valorFinalMinimo({ custoComRateio: 0, impostosPct: 10, margemDesejadaPct: 10 }, 'MARGEM').valor).toBeNull()
    expect(valorFinalMinimo({ custoComRateio: 0, impostosPct: 10, margemDesejadaPct: 10 }, 'EQUILIBRIO').valor).toBeNull()
  })

  it('plano salvo: lê o que foi gravado e ignora lixo', () => {
    const plano = lerPlanoSalvo({ global: { base: 'EQUILIBRIO', cadastradoEm: '2026-10-18T10:00:00Z', valorCadastrado: 85.06 }, a: 'x', b: { base: 'qualquer' } })
    expect(escolhaDe(plano, 'global')).toEqual({ base: 'EQUILIBRIO', cadastradoEm: '2026-10-18T10:00:00Z', valorCadastrado: 85.06 })
    expect(escolhaDe(plano, 'b').base).toBe('MARGEM')
    expect(escolhaDe(plano, 'nao-existe')).toEqual({ base: 'MARGEM', cadastradoEm: null, valorCadastrado: null })
    expect(lerPlanoSalvo(null)).toEqual({})
    expect(lerPlanoSalvo([1, 2])).toEqual({})
  })

  it('avisa quando o valor cadastrado no portal ficou diferente do atual', () => {
    expect(desatualizado({ base: 'MARGEM', cadastradoEm: '2026-10-18T10:00:00Z', valorCadastrado: 95.6 }, 95.6)).toBe(false)
    expect(desatualizado({ base: 'MARGEM', cadastradoEm: '2026-10-18T10:00:00Z', valorCadastrado: 95.6 }, 97)).toBe(true)
    expect(desatualizado({ base: 'MARGEM', cadastradoEm: null, valorCadastrado: null }, 97)).toBe(false)
  })
})

describe('plano de disputa: decremento e intervalo mínimo do edital', () => {
  const regras = { decrementoPct: 0.5, maxLances: 5 }
  const limites = { custoComRateio: 50, impostosPct: 0, margemDesejadaPct: 10 }
  const trecho = 'trecho'

  it('decremento abaixo do intervalo do edital: avisa e usa o do edital', () => {
    const passo = passoDosLances(0.5, { tipo: 'PERCENTUAL', valor: 1, trecho })
    expect(passo).toMatchObject({ configuradoPct: 0.5, efetivoPct: 1, ajustado: true })
    expect(passo.aviso).toContain('A Bela vai usar 1%')
    expect(proximoLance(100, regrasEfetivas(regras, passo))).toBe(99)
    expect(avaliarLance(100, limites, regrasEfetivas(regras, passo), 0).sugestao!.valor).toBe(99)
  })

  it('decremento igual ou acima do intervalo: mantém o configurado', () => {
    const passo = passoDosLances(2, { tipo: 'PERCENTUAL', valor: 1, trecho })
    expect(passo).toMatchObject({ efetivoPct: 2, ajustado: false, aviso: null })
    expect(proximoLance(100, regrasEfetivas({ ...regras, decrementoPct: 2 }, passo))).toBe(98)
  })

  it('intervalo em reais: o lance sugerido fica pelo menos esse valor abaixo', () => {
    const passo = passoDosLances(0.5, { tipo: 'REAIS', valor: 2, trecho })
    const efetivas = regrasEfetivas(regras, passo)
    expect(efetivas.intervaloMinimoReais).toBe(2)
    expect(proximoLance(100, efetivas)).toBe(98)
    expect(proximoLance(10000, efetivas)).toBe(9950)
    expect(avaliarLance(57, limites, efetivas, 0).mensagem).toContain('pelo menos R$')
  })

  it('sem intervalo no edital: nada muda', () => {
    expect(passoDosLances(0.5, null)).toMatchObject({ efetivoPct: 0.5, intervaloMinimoReais: null, ajustado: false, aviso: null })
    expect(proximoLance(100, regras)).toBe(99.5)
  })
})

describe('plano de disputa: leitura do edital', () => {
  it('detecta a proibição de robô de lances em frases reais de edital', () => {
    const positivos = [
      'É vedada a utilização de robôs ou de qualquer ferramenta de envio automático de lances.',
      'Fica proibido o uso de software de lances automáticos durante a sessão pública.',
      'Não será permitido o uso de programas de lances automatizados pelos licitantes.',
      'A utilização de robôs pelos licitantes, durante a etapa de lances, é vedada.',
      '13.7. É VEDADA A UTILIZAÇÃO DE ROBÔS PARA O ENVIO DE LANCES.',
    ]
    for (const frase of positivos) expect(frase.endsWith(detectarVedacaoARobo([frase])?.trecho ?? '-'), frase).toBe(true)
  })

  it('não vê proibição onde não há', () => {
    const negativos = [
      'O sistema permite o envio de lances automáticos até o valor final mínimo definido pelo licitante.',
      'É vedada a desistência dos lances já ofertados.',
      'Não é vedada a utilização de lances automáticos do próprio sistema.',
      'É vedada a participação de consórcios. O licitante pode usar o lance automático do sistema.',
      'É vedada a identificação do licitante e a etapa de lances será encerrada automaticamente.',
      'É vedada a subcontratação do kit de robótica educacional.',
      'Os lances automáticos são permitidos, sendo vedada a inserção de lances após o encerramento.',
    ]
    for (const frase of negativos) expect(detectarVedacaoARobo([frase]), frase).toBeNull()
  })

  it('lê o intervalo mínimo entre lances em percentual ou em reais', () => {
    expect(lerIntervaloMinimo(['O intervalo mínimo de diferença de valores entre os lances será de 0,5% (meio por cento).']).intervalo).toMatchObject({ tipo: 'PERCENTUAL', valor: 0.5 })
    expect(
      lerIntervaloMinimo([
        'O intervalo mínimo de diferença de valores entre os lances, que incidirá tanto em relação aos lances intermediários quanto em relação ao lance que cobrir a melhor oferta, será de R$ 1,00 (um real).',
      ]).intervalo,
    ).toMatchObject({ tipo: 'REAIS', valor: 1 })
    expect(lerIntervaloMinimo(['O intervalo mínimo entre lances do mesmo licitante não poderá ser inferior a 20 segundos.']).intervalo).toBeNull()
    const doisLotes = lerIntervaloMinimo(['Lote 1: intervalo mínimo de 1%.', 'Lote 2: intervalo mínimo de 2%.'])
    expect(doisLotes).toEqual({ intervalo: null, ambiguo: true })
  })

  it('lê o modo de disputa no texto e prefere o informado no PNCP', () => {
    expect(lerModoDeDisputa(['O modo de disputa será o aberto e fechado, conforme o art. 23.'])).toBe('ABERTO_E_FECHADO')
    expect(lerModoDeDisputa(['Modo de disputa: aberto.'])).toBe('ABERTO')
    expect(lerModoDeDisputa(['Modo de disputa: fechado-aberto.'])).toBe('FECHADO_E_ABERTO')
    expect(lerModoDeDisputa(['Nada sobre isso.'])).toBeNull()
    expect(modoDoPncp({ modoDisputaId: 1 })).toBe('ABERTO')
    expect(modoDoPncp({ modoDisputaId: 5 })).toBeNull()
    const r = regrasDoEdital({ analise: { status: 'DONE', resultado: { resumo: 'Modo de disputa: aberto.' } }, rawJson: { modoDisputaId: 3 }, criteriosDosItens: [] })
    expect(r.modoDeDisputa).toEqual({ modo: 'ABERTO_E_FECHADO', origem: 'pncp' })
  })

  it('junta os textos da análise, inclusive exigências e riscos', () => {
    const textos = textosDaAnalise({ resumo: 'a', matrizExigencias: [{ texto: 'b' }], riscos: [{ titulo: 'c', descricao: 'd' }], n: 3 })
    expect(textos).toEqual(['a', 'b', 'c', 'd'])
  })

  it('checklist com análise: modo, intervalo ajustado, robô proibido e critério', () => {
    const r = regrasDoEdital({
      analise: {
        status: 'DONE',
        resultado: {
          criterioJulgamento: 'Menor preço por item',
          riscos: [{ titulo: 'Robôs', descricao: 'Fica proibido o uso de software de lances automáticos.', severidade: 'media' }],
          documentosExigidos: ['O intervalo mínimo de diferença de valores entre os lances será de 1%.'],
        },
      },
      rawJson: { modoDisputaId: 1 },
      criteriosDosItens: [],
    })
    const passo = passoDosLances(0.5, r.intervaloMinimo)
    const checklist = checklistDaDisputa(r, passo)
    const por = Object.fromEntries(checklist.map((c) => [c.id, c]))
    expect(por.modo).toMatchObject({ situacao: 'ok', valor: 'Aberto' })
    expect(por.modo.explicacao).toContain('10 minutos')
    expect(por.intervalo).toMatchObject({ situacao: 'atencao', valor: '1%' })
    expect(por.robo).toMatchObject({ situacao: 'proibido' })
    expect(por.robo.explicacao).toContain('use só lances manuais')
    expect(por.criterio.valor).toBe('Menor preço por item')
  })

  it('sem análise: tudo como não identificado, e o critério pode vir dos itens do PNCP', () => {
    const r = regrasDoEdital({ analise: null, rawJson: {}, criteriosDosItens: ['Menor preço', null, 'Menor preço'] })
    expect(r).toMatchObject({ analisado: false, modoDeDisputa: null, intervaloMinimo: null, vedacaoARobo: null, criterioDeJulgamento: 'Menor preço' })
    const checklist = checklistDaDisputa(r, passoDosLances(0.5, null))
    expect(checklist.find((c) => c.id === 'robo')!.valor).toBe('não identificado — confira no edital')
    expect(regrasDoEdital({ analise: { status: 'RUNNING', resultado: null }, rawJson: null, criteriosDosItens: [] }).analisado).toBe(false)
    expect(regrasDoEdital({ analise: { status: 'DONE', resultado: { criterioJulgamento: 'não especificado no edital' } }, rawJson: null, criteriosDosItens: [] }).criterioDeJulgamento).toBeNull()
  })
})
