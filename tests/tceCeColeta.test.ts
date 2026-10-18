import { describe, expect, it } from 'vitest'
import {
  DependenciasDaColetaTceCe,
  ESPERA_ENTRE_TENTATIVAS_MS,
  LimitesDaColetaTceCe,
  RedeDoTceCe,
  RegistroDoTceCe,
  coletarTceCe,
  linhaDoResumo,
  varrerListaTceCe,
} from '../src/services/tceCeColeta'
import { assinaturaDaLinha, parseListaTceCe } from '../src/services/tceCeParser'
import { MotivoDaDuplicidade } from '../src/services/tceCeDuplicidade'
import { NormalizedTender, SituacaoEnum } from '../src/types'
import { LinhaFalsa, erroHttp, listaFalsa, paginaDoTceCe } from './helpers/tceCe'

const AGORA = new Date('2026-10-17T15:00:00Z')
const LIMITES: LimitesDaColetaTceCe = { maxPaginas: 10, maxDetalhes: 50, paginasSemCandidataParaParar: 3 }
const DETALHE = paginaDoTceCe('detalhe-190595.html')
const VAZIA = listaFalsa([])

type Resposta = string | Error | (() => string)

interface RedeFalsa extends RedeDoTceCe {
  paginasPedidas: number[]
  detalhesPedidos: number[]
  esperas: number[]
}

function redeFalsa(paginas: Record<number, Resposta | Resposta[]>, detalhes: Record<number, Resposta> = {}): RedeFalsa {
  const tentativas = new Map<number, number>()
  const responder = (r: Resposta): string => {
    if (r instanceof Error) throw r
    return typeof r === 'function' ? r() : r
  }
  const rede: RedeFalsa = {
    paginasPedidas: [],
    detalhesPedidos: [],
    esperas: [],
    baixarLista: async (pagina) => {
      rede.paginasPedidas.push(pagina)
      const resposta = paginas[pagina] ?? VAZIA
      if (!Array.isArray(resposta)) return responder(resposta)
      const vez = tentativas.get(pagina) ?? 0
      tentativas.set(pagina, vez + 1)
      return responder(resposta[Math.min(vez, resposta.length - 1)])
    },
    baixarDetalhe: async ({ idLicitacao }) => {
      rede.detalhesPedidos.push(idLicitacao)
      return responder(detalhes[idLicitacao] ?? DETALHE)
    },
    esperar: async (ms) => {
      rede.esperas.push(ms)
    },
  }
  return rede
}

function futura(idLicitacao: number, extra: Partial<LinhaFalsa> = {}): LinhaFalsa {
  return { idProcesso: idLicitacao + 1000, idLicitacao, abertura: '05/11/2026', ...extra }
}

function passada(idLicitacao: number): LinhaFalsa {
  return { idProcesso: idLicitacao + 1000, idLicitacao, abertura: '01/10/2026' }
}

interface DepsFalsas extends DependenciasDaColetaTceCe {
  salvos: NormalizedTender[]
  situacoes: { id: string; situacao: SituacaoEnum }[]
  conferidos: { id: string; assinatura: string | null }[]
  consultasAoPncp: { fonteId: string; modalidade: string | null }[]
}

interface DuplicadasFalsas {
  pelaLista?: Record<string, MotivoDaDuplicidade>
  peloDetalhe?: Record<string, MotivoDaDuplicidade>
}

function depsFalsas(rede: RedeDoTceCe, registros: RegistroDoTceCe[] = [], duplicadas: DuplicadasFalsas = {}): DepsFalsas {
  const deps: DepsFalsas = {
    salvos: [],
    situacoes: [],
    conferidos: [],
    consultasAoPncp: [],
    rede,
    registrosSalvos: async () => registros,
    duplicidadeNoPncp: async (tender, _agora, modalidadeConhecida) => {
      deps.consultasAoPncp.push({ fonteId: tender.fonteId, modalidade: modalidadeConhecida ? tender.modalidade : null })
      return (modalidadeConhecida ? duplicadas.peloDetalhe : duplicadas.pelaLista)?.[tender.fonteId] ?? null
    },
    salvarLote: async (lote) => {
      deps.salvos.push(...lote)
      const existentes = new Set(registros.map((r) => `TCE-CE-${r.idLicitacao}`))
      const novos = lote.filter((t) => !existentes.has(t.fonteId)).length
      return { totalNew: novos, totalDupes: lote.length - novos, totalUpdated: lote.length - novos }
    },
    atualizarSituacao: async (registro, situacao) => {
      deps.situacoes.push({ id: registro.id, situacao })
    },
    registrarConferencia: async (id, _agora, assinatura) => {
      deps.conferidos.push({ id, assinatura })
    },
  }
  return deps
}

function registro(idLicitacao: number, over: Partial<RegistroDoTceCe> = {}): RegistroDoTceCe {
  return {
    id: `reg-${idLicitacao}`,
    idLicitacao,
    idProcesso: idLicitacao + 1000,
    situacao: 'ABERTA',
    aberturaAt: new Date('2026-11-05T03:00:00Z'),
    conferidaEm: new Date('2026-10-17T12:00:00Z'),
    assinaturaDaLista: null,
    ...over,
  }
}

describe('varrerListaTceCe — paginação, limites e espera', () => {
  it('anda página a página até a página vazia e junta as linhas sem repetir', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(1), futura(2)]), 2: listaFalsa([futura(2), futura(3)]) })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(rede.paginasPedidas).toEqual([1, 2, 3])
    expect(r.linhas.map((l) => l.idLicitacao)).toEqual([1, 2, 3])
    expect(r).toMatchObject({ paginasLidas: 3, motivoDaParada: 'fim', completa: true, falhas: [] })
  })

  it('para na última página anunciada sem pedir a seguinte', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(1)], 2), 2: listaFalsa([futura(2)], 2) })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(rede.paginasPedidas).toEqual([1, 2])
    expect(r.motivoDaParada).toBe('fim')
  })

  it('respeita o teto de páginas por coleta', async () => {
    const paginas = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, listaFalsa([futura(i + 1)], 113)]))
    const r = await varrerListaTceCe(redeFalsa(paginas), AGORA, { ...LIMITES, maxPaginas: 4 })
    expect(r).toMatchObject({ paginasLidas: 4, motivoDaParada: 'limite', completa: false })
  })

  it('depois das sessões futuras, para após N páginas só com sessões passadas', async () => {
    const paginas: Record<number, string> = { 1: listaFalsa([futura(1)], 113) }
    for (let p = 2; p <= 30; p++) paginas[p] = listaFalsa([passada(p)], 113)
    paginas[3] = listaFalsa([passada(3), futura(33, { abertura: '01/10/2026', reabertura: '25/10/2026' })], 113)
    const rede = redeFalsa(paginas)
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(rede.paginasPedidas).toEqual([1, 2, 3, 4, 5, 6])
    expect(r).toMatchObject({ motivoDaParada: 'sem_candidatas', completa: true })
  })

  it('erro 5xx ou de rede: espera e tenta de novo (5 s, 10 s) antes de desistir da página', async () => {
    const rede = redeFalsa({ 1: [erroHttp(502), erroHttp(undefined), listaFalsa([futura(1)])] })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(rede.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS, ESPERA_ENTRE_TENTATIVAS_MS * 2])
    expect(r.linhas).toHaveLength(1)
    expect(r.completa).toBe(true)
  })

  it('página que falha de vez fica registrada, a varredura segue e a lista não conta como completa', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(1)]), 2: erroHttp(500), 3: listaFalsa([futura(3)]) })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(r.linhas.map((l) => l.idLicitacao)).toEqual([1, 3])
    expect(r.falhas).toEqual(['página 2 (HTTP 500)'])
    expect(r.completa).toBe(false)
  })

  it('3 páginas seguidas com falha encerram a varredura', async () => {
    const rede = redeFalsa({ 1: erroHttp(500), 2: erroHttp(500), 3: erroHttp(500), 4: listaFalsa([futura(4)]) })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(r.motivoDaParada).toBe('falhas')
    expect(rede.paginasPedidas).not.toContain(4)
  })

  it('403 ou 429 param tudo na hora, sem insistir', async () => {
    for (const status of [403, 429]) {
      const rede = redeFalsa({ 1: listaFalsa([futura(1)]), 2: erroHttp(status), 3: listaFalsa([futura(3)]) })
      const r = await varrerListaTceCe(rede, AGORA, LIMITES)
      expect(r.motivoDaParada).toBe('bloqueio')
      expect(rede.paginasPedidas).toEqual([1, 2])
      expect(rede.esperas).toEqual([])
    }
  })

  it('página fora do formato conta como falha (sem tentar de novo)', async () => {
    const rede = redeFalsa({ 1: '<html>manutenção</html>', 2: listaFalsa([futura(2)]) })
    const r = await varrerListaTceCe(rede, AGORA, LIMITES)
    expect(r.falhas[0]).toMatch(/página 1/)
    expect(rede.esperas).toEqual([])
    expect(r.linhas.map((l) => l.idLicitacao)).toEqual([2])
  })
})

describe('coletarTceCe — detalhes, duplicidade com o PNCP e registros já salvos', () => {
  it('descarta pela lista o que já está no PNCP (sem gastar o detalhe), confere de novo com a modalidade e grava o resto', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(10, { abertura: '20/11/2026' }), futura(11), futura(12), passada(13)]) })
    const deps = depsFalsas(rede, [], { pelaLista: { 'TCE-CE-11': 'objeto' }, peloDetalhe: { 'TCE-CE-12': 'numero' } })
    const r = await coletarTceCe(deps, AGORA, LIMITES)

    expect(rede.detalhesPedidos).toEqual([12, 10])
    expect(deps.consultasAoPncp).toEqual([
      { fonteId: 'TCE-CE-11', modalidade: null },
      { fonteId: 'TCE-CE-12', modalidade: null },
      { fonteId: 'TCE-CE-10', modalidade: null },
      { fonteId: 'TCE-CE-12', modalidade: 'PREGAO_ELETRONICO' },
      { fonteId: 'TCE-CE-10', modalidade: 'PREGAO_ELETRONICO' },
    ])
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-CE-10'])
    expect(r).toMatchObject({
      registrosNaLista: 4,
      comSessaoFutura: 3,
      municipios: 1,
      detalhesLidos: 2,
      novasForaDoPncp: 1,
      duplicadasPncpPorObjeto: 1,
      duplicadasPncpPorNumero: 1,
      totalNew: 1,
    })
    expect(deps.salvos[0]).toMatchObject({ fonte: 'TCE_CE', linkEdital: 'https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/detalhes/proc/1010/licit/10' })
    expect(linhaDoResumo(r)).toMatch(/novas fora do PNCP: 1, já no PNCP: 2 \(objeto 1, número 1\)/)
  })

  it('licitação publicada hoje espera a próxima coleta (o PNCP ainda pode trazê-la)', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(20, { publicado: '17/10/2026' })]) })
    const r = await coletarTceCe(depsFalsas(rede), AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([])
    expect(r.aguardandoPncp).toBe(1)
  })

  it('registro já salvo, sem mudança na lista e conferido há pouco, não gasta requisição', async () => {
    const lista = listaFalsa([futura(30)])
    const linha = parseListaTceCe(lista).linhas[0]
    const rede = redeFalsa({ 1: lista })
    const deps = depsFalsas(rede, [registro(30, { assinaturaDaLista: assinaturaDaLinha(linha) })])
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([])
    expect(r.revisitadas).toBe(0)
    expect(deps.salvos).toEqual([])
  })

  it('registro já salvo com reabertura nova na lista é relido, atualizado e conferido com a assinatura nova', async () => {
    const lista = listaFalsa([futura(31, { reabertura: '10/11/2026' })])
    const linha = parseListaTceCe(lista).linhas[0]
    const rede = redeFalsa({ 1: lista }, { 31: paginaDoTceCe('detalhe-190595.html').replace('</strong>Aberta', '</strong>Suspensa') })
    const deps = depsFalsas(rede, [registro(31, { assinaturaDaLista: 'antiga' })])
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([31])
    expect(r.revisitadas).toBe(1)
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-CE-31'])
    expect(deps.situacoes).toEqual([{ id: 'reg-31', situacao: 'SUSPENSA' }])
    expect(deps.conferidos).toEqual([{ id: 'reg-31', assinatura: assinaturaDaLinha(linha) }])
    expect(r.duplicadasPncpPorObjeto + r.duplicadasPncpPorNumero).toBe(0)
  })

  it('registro conferido há mais de 3 dias é relido mesmo sem mudança na lista', async () => {
    const lista = listaFalsa([futura(32)])
    const linha = parseListaTceCe(lista).linhas[0]
    const rede = redeFalsa({ 1: lista })
    const deps = depsFalsas(rede, [registro(32, { assinaturaDaLista: assinaturaDaLinha(linha), conferidaEm: new Date('2026-10-10T12:00:00Z') })])
    await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([32])
  })

  it('aberta que sumiu da lista completa tem o detalhe conferido e a situação nova gravada', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(40)]) }, { 41: paginaDoTceCe('detalhe-190595.html').replace('</strong>Aberta', '</strong>Cancelada') })
    const deps = depsFalsas(rede, [registro(41), registro(42, { aberturaAt: new Date('2026-10-01T12:00:00Z') }), registro(43, { situacao: 'CANCELADA' })])
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([40, 41])
    expect(r.sumidas).toBe(1)
    expect(deps.situacoes).toEqual([{ id: 'reg-41', situacao: 'CANCELADA' }])
    expect(deps.conferidos.map((c) => c.id)).toEqual(['reg-41'])
  })

  it('com a lista incompleta, nada é tratado como sumido', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(50)]), 2: erroHttp(500) })
    const deps = depsFalsas(rede, [registro(51)])
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(r.listaCompleta).toBe(false)
    expect(rede.detalhesPedidos).toEqual([50])
    expect(r.sumidas).toBe(0)
  })

  it('teto de detalhes por coleta: o que passar fica para a próxima, as sessões mais próximas primeiro', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(60, { abertura: '30/11/2026' }), futura(61, { abertura: '20/10/2026' }), futura(62, { abertura: '25/10/2026' })]) })
    const r = await coletarTceCe(depsFalsas(rede), AGORA, { ...LIMITES, maxDetalhes: 2 })
    expect(rede.detalhesPedidos).toEqual([61, 62])
    expect(r.adiadasPeloLimite).toBe(1)
  })

  it('bloqueio no detalhe para as leituras, mas grava o que já leu', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(70, { abertura: '20/10/2026' }), futura(71, { abertura: '21/10/2026' }), futura(72, { abertura: '22/10/2026' })]) }, { 71: erroHttp(429) })
    const deps = depsFalsas(rede)
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([70, 71])
    expect(r.bloqueado).toBe(true)
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-CE-70'])
  })

  it('detalhe com erro 5xx é tentado mais uma vez e depois fica nas falhas', async () => {
    const rede = redeFalsa({ 1: listaFalsa([futura(80, { abertura: '20/10/2026' }), futura(81, { abertura: '21/10/2026' })]) }, { 80: erroHttp(500) })
    const deps = depsFalsas(rede)
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(rede.detalhesPedidos).toEqual([80, 80, 81])
    expect(r.falhas).toEqual(['detalhe 80 (HTTP 500)'])
    expect(deps.salvos.map((t) => t.fonteId)).toEqual(['TCE-CE-81'])
  })

  it('nova que o detalhe mostra fechada ou com sessão já passada não é gravada', async () => {
    const fechada = paginaDoTceCe('detalhe-190595.html').replace('</strong>Aberta', '</strong>Deserta')
    const passou = paginaDoTceCe('detalhe-190595.html').replace('03/11/2026', '10/10/2026')
    const rede = redeFalsa({ 1: listaFalsa([futura(90), futura(91)]) }, { 90: fechada, 91: passou })
    const deps = depsFalsas(rede)
    const r = await coletarTceCe(deps, AGORA, LIMITES)
    expect(r.ignoradas).toBe(2)
    expect(deps.salvos).toEqual([])
  })
})
