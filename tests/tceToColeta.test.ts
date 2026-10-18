import { describe, expect, it } from 'vitest'
import {
  DependenciasDaColetaTceTo,
  ESPERA_ENTRE_TENTATIVAS_MS,
  LimitesDaColetaTceTo,
  RedeDoTceTo,
  RegistroDoTceTo,
  chaveDaMemoriaTceTo,
  coletarTceTo,
  linhaDoResumoTceTo,
  memoriaDoTceToNoRedis,
  varrerListaTceTo,
} from '../src/services/tceToColeta'
import { assinaturaDaLinhaTceTo, parseListaTceTo } from '../src/services/tceToParser'
import { MemoriaDeDiarios } from '../src/services/queridoDiarioColeta'
import { MotivoDaDuplicidade } from '../src/services/tceCeDuplicidade'
import { NormalizedTender, SituacaoEnum } from '../src/types'
import { ItemDaListaTceTo, arquivoDoTceTo, detalheJson, erroHttpTceTo, itemFalso, itensReaisDoTceTo, listaJson } from './helpers/tceTo'

const AGORA = new Date('2026-10-18T15:00:00Z')
const LIMITES: LimitesDaColetaTceTo = { porPagina: 3, maxPaginas: 10, maxDetalhes: 50, orcamentoMs: 60_000 }

type Resposta = string | Error

interface RedeFalsa extends RedeDoTceTo {
  paginasPedidas: { pagina: number; limite: number; inicio: string; fim: string }[]
  detalhesPedidos: number[]
  esperas: number[]
}

function redeFalsa(paginas: Record<number, Resposta | Resposta[]>, detalhes: Record<number, Resposta> = {}): RedeFalsa {
  const tentativas = new Map<number, number>()
  const responder = (r: Resposta): string => {
    if (r instanceof Error) throw r
    return r
  }
  const rede: RedeFalsa = {
    paginasPedidas: [],
    detalhesPedidos: [],
    esperas: [],
    baixarLista: async (pagina, limite, inicio, fim) => {
      rede.paginasPedidas.push({ pagina, limite, inicio: inicio.toISOString(), fim: fim.toISOString() })
      const resposta = paginas[pagina] ?? listaJson([], 0)
      if (!Array.isArray(resposta)) return responder(resposta)
      const vez = tentativas.get(pagina) ?? 0
      tentativas.set(pagina, vez + 1)
      return responder(resposta[Math.min(vez, resposta.length - 1)])
    },
    baixarDetalhe: async (idProcedimento) => {
      rede.detalhesPedidos.push(idProcedimento)
      return responder(detalhes[idProcedimento] ?? detalheJson(idProcedimento))
    },
    esperar: async (ms) => {
      rede.esperas.push(ms)
    },
  }
  return rede
}

function memoriaFalsa(lidos: string[] = []): MemoriaDeDiarios & { marcados: string[] } {
  const conjunto = new Set(lidos)
  const memoria = {
    marcados: [] as string[],
    jaLidos: async (chaves: string[]) => new Set(chaves.filter((c) => conjunto.has(c))),
    marcarLido: async (chave: string) => {
      conjunto.add(chave)
      memoria.marcados.push(chave)
    },
  }
  return memoria
}

interface DepsFalsas extends DependenciasDaColetaTceTo {
  salvos: NormalizedTender[]
  situacoes: { id: string; situacao: SituacaoEnum }[]
  conferidos: { id: string; assinatura: string | null }[]
  consultasAoPncp: string[]
}

function depsFalsas(rede: RedeDoTceTo, registros: RegistroDoTceTo[] = [], duplicadas: Record<string, MotivoDaDuplicidade> = {}, memoria = memoriaFalsa(), relogio = () => 0): DepsFalsas {
  const deps: DepsFalsas = {
    salvos: [],
    situacoes: [],
    conferidos: [],
    consultasAoPncp: [],
    rede,
    memoria,
    registrosSalvos: async () => registros,
    duplicidadeNoPncp: async (tender, _agora, modalidadeConhecida) => {
      expect(modalidadeConhecida).toBe(tender.modalidade !== 'OUTROS')
      deps.consultasAoPncp.push(tender.fonteId)
      return duplicadas[tender.fonteId] ?? null
    },
    salvarLote: async (lote) => {
      deps.salvos.push(...lote)
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    },
    atualizarSituacao: async (registro, situacao) => {
      deps.situacoes.push({ id: registro.id, situacao })
    },
    registrarConferencia: async (id, _agora, assinatura) => {
      deps.conferidos.push({ id, assinatura })
    },
    relogio,
  }
  return deps
}

function registro(item: ItemDaListaTceTo, extra: Partial<RegistroDoTceTo> = {}): RegistroDoTceTo {
  const linha = parseListaTceTo(listaJson([item])).linhas[0]
  return {
    id: `r${item.idProcedimento}`,
    idProcedimento: item.idProcedimento,
    situacao: 'ABERTA',
    aberturaAt: new Date('2026-11-05T03:00:00Z'),
    conferidaEm: new Date('2026-10-18T10:00:00Z'),
    assinaturaDaLista: assinaturaDaLinhaTceTo(linha),
    ...extra,
  }
}

describe('TCE-TO — lista', () => {
  it('pagina até a página incompleta e pede a janela de hoje até ~13 meses à frente', async () => {
    const rede = redeFalsa({ 1: listaJson([itemFalso(1), itemFalso(2), itemFalso(3)], 5), 2: listaJson([itemFalso(4), itemFalso(5)], 5) })
    const lista = await varrerListaTceTo(rede, AGORA, LIMITES)
    expect(lista).toMatchObject({ paginasLidas: 2, totalAnunciado: 5, motivoDaParada: 'fim', completa: true })
    expect(lista.linhas.map((l) => l.idProcedimento)).toEqual([1, 2, 3, 4, 5])
    expect(rede.paginasPedidas[0]).toEqual({ pagina: 1, limite: 3, inicio: '2026-10-18T03:00:00.000Z', fim: '2027-11-22T03:00:00.000Z' })
  })

  it('para no total anunciado mesmo com a página cheia', async () => {
    const rede = redeFalsa({ 1: listaJson([itemFalso(1), itemFalso(2), itemFalso(3)], 3) })
    const lista = await varrerListaTceTo(rede, AGORA, LIMITES)
    expect(rede.paginasPedidas).toHaveLength(1)
    expect(lista.completa).toBe(true)
  })

  it('erro 5xx espera e repete; 403 para tudo na hora', async () => {
    const instavel = redeFalsa({ 1: [erroHttpTceTo(503), erroHttpTceTo(undefined), listaJson([itemFalso(1)], 1)] })
    const lida = await varrerListaTceTo(instavel, AGORA, LIMITES)
    expect(lida.completa).toBe(true)
    expect(instavel.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS, ESPERA_ENTRE_TENTATIVAS_MS * 2])

    const bloqueada = redeFalsa({ 1: erroHttpTceTo(403) })
    const parada = await varrerListaTceTo(bloqueada, AGORA, LIMITES)
    expect(parada).toMatchObject({ motivoDaParada: 'bloqueio', completa: false })
    expect(bloqueada.paginasPedidas).toHaveLength(1)
  })

  it('três páginas seguidas fora do formato desistem; teto de páginas', async () => {
    const quebrada = redeFalsa({ 1: '<html>', 2: '<html>', 3: '<html>' })
    expect(await varrerListaTceTo(quebrada, AGORA, LIMITES)).toMatchObject({ motivoDaParada: 'falhas', completa: false })
    const cheia = (n: number) => listaJson([itemFalso(n * 10 + 1), itemFalso(n * 10 + 2), itemFalso(n * 10 + 3)], 999)
    const longa = redeFalsa({ 1: cheia(1), 2: cheia(2), 3: cheia(3) })
    expect(await varrerListaTceTo(longa, AGORA, { ...LIMITES, maxPaginas: 2 })).toMatchObject({ motivoDaParada: 'limite', paginasLidas: 2, completa: false })
  })
})

describe('TCE-TO — coleta', () => {
  it('com a lista real: só municipais, descarta o que já está no PNCP e grava o resto com detalhe', async () => {
    const reais = itensReaisDoTceTo()
    const rede = redeFalsa({ 1: listaJson(reais, reais.length) }, { 829301: arquivoDoTceTo('detalhe-829301.json') })
    const deps = depsFalsas(rede, [], { 'TCE-TO-829290': 'objeto', 'TCE-TO-829304': 'numero' })
    const resumo = await coletarTceTo(deps, AGORA, { ...LIMITES, porPagina: 200, maxDetalhes: 300 })

    expect(resumo).toMatchObject({ paginas: 1, registrosNaLista: 125, municipais: 88, comSessaoFutura: 88, municipios: 47, listaCompleta: true })
    expect(resumo.duplicadasPncpPorObjeto).toBe(1)
    expect(resumo.duplicadasPncpPorNumero).toBe(1)
    expect(deps.salvos.every((t) => t.fonte === 'TCE_TO' && t.uf === 'TO' && t.situacao === 'ABERTA')).toBe(true)
    expect(deps.salvos.map((t) => t.fonteId)).not.toContain('TCE-TO-829290')
    expect(deps.salvos.map((t) => t.fonteId)).not.toContain('TCE-TO-829251')
    expect(resumo.novasForaDoPncp).toBe(deps.salvos.length)
    expect(resumo.novasForaDoPncp + resumo.ignoradas + 2).toBe(88)
    expect(rede.detalhesPedidos).toHaveLength(resumo.novasForaDoPncp)
    const taguatinga = deps.salvos.find((t) => t.fonteId === 'TCE-TO-829301')
    expect(taguatinga?.rawJson).toMatchObject({ detalheLido: true, criterioDeJulgamento: 'Menor Preço' })
    expect(linhaDoResumoTceTo(resumo)).toContain(`novas fora do PNCP: ${resumo.novasForaDoPncp}`)
  })

  it('cadastrada hoje espera a coleta seguinte (o PNCP ainda pode trazer)', async () => {
    const rede = redeFalsa({ 1: listaJson([itemFalso(1, { dataCadastroProcedimento: '18/10/2026' }), itemFalso(2)]) })
    const deps = depsFalsas(rede)
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(resumo.aguardandoPncp).toBe(1)
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-TO-2'])
    expect(deps.consultasAoPncp).toEqual(['TCE-TO-2'])
  })

  it('sem mudança na lista não relê nada; mudança relê o detalhe e atualiza a situação', async () => {
    const item = itemFalso(7)
    const parada = redeFalsa({ 1: listaJson([item]) })
    const semMudanca = depsFalsas(parada, [registro(item)])
    const resumo = await coletarTceTo(semMudanca, AGORA, LIMITES)
    expect(parada.detalhesPedidos).toEqual([])
    expect(resumo).toMatchObject({ totalNew: 0, revisitadas: 0 })

    const suspenso = { ...item, situacao_2fase: 'Suspenso.' }
    const mudou = redeFalsa({ 1: listaJson([suspenso]) })
    const comMudanca = depsFalsas(mudou, [registro(item)])
    const depois = await coletarTceTo(comMudanca, AGORA, LIMITES)
    expect(mudou.detalhesPedidos).toEqual([7])
    expect(depois).toMatchObject({ revisitadas: 1, situacoesAlteradas: 1 })
    expect(comMudanca.situacoes).toEqual([{ id: 'r7', situacao: 'SUSPENSA' }])
    expect(comMudanca.conferidos[0].assinatura).toContain('Suspenso.')
  })

  it('a que sumiu da lista completa tem o detalhe conferido uma vez por dia', async () => {
    const sumida = itemFalso(9)
    const rede = redeFalsa({ 1: listaJson([itemFalso(1)]) }, { 9: detalheJson(9, { ativo: false }) })
    const memoria = memoriaFalsa()
    const deps = depsFalsas(rede, [registro(sumida)], {}, memoria)
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(resumo.sumidas).toBe(1)
    expect(deps.situacoes).toEqual([{ id: 'r9', situacao: 'CANCELADA' }])
    expect(memoria.marcados).toContain('sumida:9:2026-10-18')

    const outra = redeFalsa({ 1: listaJson([itemFalso(1)]) })
    await coletarTceTo(depsFalsas(outra, [registro(sumida), registro(itemFalso(1))], {}, memoria), AGORA, LIMITES)
    expect(outra.detalhesPedidos).toEqual([])
  })

  it('lista incompleta não trata ninguém como sumido', async () => {
    const rede = redeFalsa({ 1: listaJson([itemFalso(1), itemFalso(2), itemFalso(3)], 9), 2: erroHttpTceTo(403) })
    const deps = depsFalsas(rede, [registro(itemFalso(9))])
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(resumo).toMatchObject({ listaCompleta: false, bloqueado: true, sumidas: 0 })
    expect(rede.detalhesPedidos).toEqual([])
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-TO-1', 'TCE-TO-2', 'TCE-TO-3'])
    expect(deps.salvos.every((t) => t.rawJson.detalheLido === false)).toBe(true)
  })

  it('403 no detalhe para os detalhes, mas as novas ficam gravadas com os dados da lista', async () => {
    const rede = redeFalsa({ 1: listaJson([itemFalso(1), itemFalso(2)]) }, { 1: erroHttpTceTo(429) })
    const deps = depsFalsas(rede)
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([1])
    expect(resumo).toMatchObject({ bloqueado: true, semDetalhe: 2, novasForaDoPncp: 2 })
    expect(deps.salvos).toHaveLength(2)
  })

  it('teto de detalhes e orçamento de tempo: as novas seguem sem detalhe, as revisões ficam para depois', async () => {
    let instante = 0
    const relogio = () => instante
    const itens = [itemFalso(1), itemFalso(2), itemFalso(3)]
    const rede: RedeFalsa = redeFalsa({ 1: listaJson(itens) })
    const original = rede.baixarDetalhe
    rede.baixarDetalhe = async (id) => {
      instante += 40_000
      return original(id)
    }
    const revisao = itemFalso(5)
    const deps = depsFalsas(rede, [registro(revisao, { conferidaEm: new Date('2026-10-01T00:00:00Z') })], {}, memoriaFalsa(), relogio)
    rede.baixarLista = async () => listaJson([...itens, revisao])
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([1, 2])
    expect(resumo).toMatchObject({ novasForaDoPncp: 3, semDetalhe: 1, adiadasPeloLimite: 1, revisitadas: 0 })
  })

  it('a que foi lida e descartada não é relida enquanto a linha não muda', async () => {
    const item = itemFalso(4)
    const linha = parseListaTceTo(listaJson([item])).linhas[0]
    const memoria = memoriaFalsa([chaveDaMemoriaTceTo(linha)])
    const rede = redeFalsa({ 1: listaJson([item]) })
    const deps = depsFalsas(rede, [], {}, memoria)
    const resumo = await coletarTceTo(deps, AGORA, LIMITES)
    expect(resumo.jaLidasAntes).toBe(1)
    expect(rede.detalhesPedidos).toEqual([])
    expect(deps.consultasAoPncp).toEqual([])

    const fracassada = redeFalsa({ 1: listaJson([itemFalso(6)]) }, { 6: detalheJson(6, { situacao2Fase: 'Fracassada' }) })
    const outraMemoria = memoriaFalsa()
    const descartada = await coletarTceTo(depsFalsas(fracassada, [], {}, outraMemoria), AGORA, LIMITES)
    expect(descartada).toMatchObject({ ignoradas: 1, novasForaDoPncp: 0 })
    expect(outraMemoria.marcados).toHaveLength(1)
  })

  it('memória no Redis sem Redis segue sem memória', async () => {
    const quebrado = {
      pipeline: () => ({ zscore: () => undefined, exec: async () => Promise.reject(new Error('sem redis')) }),
      zadd: async () => Promise.reject(new Error('sem redis')),
      zremrangebyscore: async () => Promise.reject(new Error('sem redis')),
    }
    const memoria = memoriaDoTceToNoRedis(quebrado)
    expect(await memoria.jaLidos(['1:abc'])).toEqual(new Set())
    await expect(memoria.marcarLido('1:abc')).resolves.toBeUndefined()
  })
})
