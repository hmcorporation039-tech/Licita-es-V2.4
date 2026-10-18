import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedTender } from '../src/types'

const http = vi.hoisted(() => ({
  api: vi.fn(),
  arquivos: vi.fn(),
}))

vi.mock('../src/lib/httpClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/httpClient')>()),
  queridoDiarioClient: { get: http.api },
  queridoDiarioArquivosClient: { get: http.arquivos },
}))

import {
  BLOQUEIOS_SEGUIDOS_NOS_ARQUIVOS,
  CHAVE_DOS_DIARIOS_LIDOS,
  DependenciasDaColeta,
  ESPERA_APOS_BLOQUEIO_MS,
  MAXIMO_DE_TERRITORIOS_POR_BUSCA,
  MemoriaDeDiarios,
  coletarQueridoDiario,
  descricaoDaParada,
  desfechoDaColeta,
  lotesPorUf,
  memoriaDeDiariosNoRedis,
} from '../src/services/queridoDiarioColeta'
import {
  CONSULTA_DE_AVISOS,
  CidadeDoQueridoDiario,
  TAMANHO_DA_PAGINA,
  baixarTextoDoDiario,
  buscarCidadesDoQueridoDiario,
  buscarDiarios,
} from '../src/services/queridoDiarioService'
import { GazetaQueridoDiario } from '../src/services/queridoDiarioParser'

const JANELA = { publicadoDesde: '2026-10-12', publicadoAte: '2026-10-17' }
const INICIO = new Date('2026-10-17T12:00:00Z').getTime()

function cidade(uf: string, n: number): CidadeDoQueridoDiario {
  const prefixo: Record<string, string> = { BA: '29', TO: '17', SP: '35', RJ: '33', AL: '27' }
  return { territory_id: `${prefixo[uf]}${String(n).padStart(5, '0')}`, territory_name: `Cidade ${uf} ${n}`, state_code: uf, level: '3' }
}

function diario(uf: string, territorio: string, n: number): GazetaQueridoDiario {
  return {
    territory_id: territorio,
    territory_name: `Cidade ${territorio}`,
    state_code: uf,
    date: '2026-10-16',
    url: `https://data.queridodiario.ok.org.br/${territorio}/2026-10-16/${n}.pdf`,
    txt_url: `https://data.queridodiario.ok.org.br/${territorio}/2026-10-16/${n}.txt`,
  }
}

function aviso(numero: number, objeto: string, extra = ''): string {
  return `AVISO DE LICITAÇÃO
PREGÃO ELETRÔNICO Nº ${numero}/2026
OBJETO: ${objeto}.
DATA DA SESSÃO: 05/11/2026 às 09h00.
${extra}
...........................................................................................................
`
}

function erroHttp(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

function memoriaEmTeste(jaLidos: string[] = []) {
  const lidos = new Set(jaLidos)
  const memoria: MemoriaDeDiarios = {
    jaLidos: vi.fn(async (urls: string[]) => new Set(urls.filter((u) => lidos.has(u)))),
    marcarLido: vi.fn(async (url: string) => {
      lidos.add(url)
    }),
  }
  return { memoria, lidos }
}

function dependencias(over: Partial<DependenciasDaColeta> = {}) {
  let relogio = INICIO
  const esperas: number[] = []
  const salvos: NormalizedTender[] = []
  const { memoria, lidos } = memoriaEmTeste()
  const dep: DependenciasDaColeta = {
    buscarCidades: buscarCidadesDoQueridoDiario,
    buscarDiarios,
    baixarTexto: baixarTextoDoDiario,
    existeNoPncp: vi.fn(async () => false),
    prepararRepublicacao: vi.fn(async (t: NormalizedTender) => t),
    salvarLote: vi.fn(async (lote: NormalizedTender[]) => {
      salvos.push(...lote)
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    }),
    memoria,
    esperar: vi.fn(async (ms: number) => {
      esperas.push(ms)
      relogio += ms
    }),
    agora: () => relogio,
    ...over,
  }
  return { dep, esperas, salvos, lidos, avancar: (ms: number) => (relogio += ms) }
}

type Rota = (params: Record<string, unknown>) => unknown

function api(cidades: CidadeDoQueridoDiario[] | Error, gazettes: Rota) {
  http.api.mockImplementation(async (caminho: string, config: { params: Record<string, unknown> }) => {
    if (caminho === '/cities') {
      if (cidades instanceof Error) throw cidades
      return { data: { cities: cidades } }
    }
    const resposta = gazettes(config.params)
    if (resposta instanceof Error) throw resposta
    return { data: resposta }
  })
}

function pagina(todos: GazetaQueridoDiario[], params: Record<string, unknown>) {
  const territorios = (params.territory_ids as string[]) ?? []
  const filtrados = territorios.length ? todos.filter((g) => territorios.includes(g.territory_id)) : todos
  const offset = Number(params.offset)
  return { total_gazettes: filtrados.length, gazettes: filtrados.slice(offset, offset + Number(params.size)) }
}

function buscasDeDiarios(): Record<string, unknown>[] {
  return http.api.mock.calls.filter(([caminho]) => caminho === '/gazettes').map(([, config]) => config.params)
}

beforeEach(() => {
  http.api.mockReset()
  http.arquivos.mockReset()
  http.arquivos.mockImplementation(async (caminho: string) => {
    const numero = Number(caminho.match(/(\d+)\.txt$/)?.[1] ?? 1)
    return { data: aviso(numero, `Aquisição de material de consumo para a secretaria, lote ${numero}`) }
  })
})

describe('Querido Diário — busca dividida por UF', () => {
  it('pede os municípios com diário e manda os IBGE repetidos na URL, sem colchetes', async () => {
    http.api.mockResolvedValueOnce({ data: { cities: [cidade('BA', 1)] } })
    await buscarCidadesDoQueridoDiario()
    const [caminho, config] = http.api.mock.calls[0]
    expect(caminho).toBe('/cities')
    expect(config.params).toEqual({ levels: ['1', '2', '3'] })

    http.api.mockResolvedValueOnce({ data: { total_gazettes: 0, gazettes: [] } })
    await buscarDiarios(JANELA, 50, ['2900001', '2900002'])
    const [, configDaBusca] = http.api.mock.calls[1]
    expect(configDaBusca.params).toMatchObject({ territory_ids: ['2900001', '2900002'], offset: 50, size: TAMANHO_DA_PAGINA, querystring: CONSULTA_DE_AVISOS })
    const url = axios.getUri({ url: 'https://api.queridodiario.org.br/gazettes', ...configDaBusca })
    expect(url).toContain('territory_ids=2900001&territory_ids=2900002')
    expect(url).not.toContain('%5B')
  })

  it('busca todos os termos de aviso pedidos', () => {
    for (const termo of ['"pregão presencial"', '"dispensa eletrônica"', '"tomada de preços"', '"chamamento público"', '"aviso de credenciamento"', '"aviso de licitação"']) {
      expect(CONSULTA_DE_AVISOS).toContain(termo)
    }
  })

  it('ordena as UFs com pior cobertura do PNCP primeiro e divide UF grande em lotes', () => {
    const cidades = [
      cidade('RJ', 1),
      ...Array.from({ length: MAXIMO_DE_TERRITORIOS_POR_BUSCA + 10 }, (_, i) => cidade('SP', i + 1)),
      cidade('TO', 1),
      cidade('BA', 1),
      cidade('BA', 2),
      cidade('AL', 1),
      { territory_id: 'x', territory_name: 'Inválido', state_code: 'BA' },
    ]
    const lotes = lotesPorUf(cidades)
    expect(lotes.map((l) => [l.uf, l.territorios.length])).toEqual([
      ['BA', 2],
      ['TO', 1],
      ['AL', 1],
      ['SP', MAXIMO_DE_TERRITORIOS_POR_BUSCA],
      ['SP', 10],
      ['RJ', 1],
    ])
  })

  it('pagina dentro de cada UF até o fim e mede por UF', async () => {
    const ba = Array.from({ length: TAMANHO_DA_PAGINA + 5 }, (_, i) => diario('BA', '2900001', i + 1))
    const to = [diario('TO', '1700001', 900)]
    api([cidade('BA', 1), cidade('TO', 1)], (params) => pagina([...ba, ...to], params))
    const { dep, salvos, lidos, esperas } = dependencias()

    const r = await coletarQueridoDiario(dep, JANELA)

    expect(buscasDeDiarios().map((p) => [p.territory_ids, p.offset])).toEqual([
      [['2900001'], 0],
      [['2900001'], TAMANHO_DA_PAGINA],
      [['1700001'], 0],
    ])
    expect(r.motivoDaParada).toBe('concluida')
    expect(r.diariosLidos).toBe(TAMANHO_DA_PAGINA + 6)
    expect(salvos).toHaveLength(TAMANHO_DA_PAGINA + 6)
    expect(lidos.size).toBe(TAMANHO_DA_PAGINA + 6)
    expect(r.porUf.map((m) => [m.uf, m.diariosLidos, m.avisos, m.novos])).toEqual([
      ['BA', TAMANHO_DA_PAGINA + 5, TAMANHO_DA_PAGINA + 5, TAMANHO_DA_PAGINA + 5],
      ['TO', 1, 1, 1],
    ])
    expect(esperas.filter((ms) => ms === 3_000)).toHaveLength(2)
    expect(descricaoDaParada(r)).toBeNull()
  })

  it('sem a lista de municípios, faz uma busca nacional sem filtro', async () => {
    api(erroHttp(500), (params) => pagina([diario('SE', '2800001', 1)], params))
    const { dep } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(buscasDeDiarios().map((p) => p.territory_ids)).toEqual([[]])
    expect(r.porUf.map((m) => m.uf)).toEqual(['SE'])
  })
})

describe('Querido Diário — orçamento por coleta', () => {
  const todos = [diario('BA', '2900001', 1), diario('BA', '2900001', 2), diario('TO', '1700001', 3), diario('RJ', '3300001', 4)]
  const cidades = [cidade('RJ', 1), cidade('TO', 1), cidade('BA', 1)]

  it('para no limite de downloads e deixa as UFs restantes para a próxima coleta', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { dep, lidos } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA, { tempoMs: 3_600_000, buscas: 50, downloads: 2 })
    expect(r.motivoDaParada).toBe('downloads')
    expect(r.diariosLidos).toBe(2)
    expect([...lidos].every((u) => u.includes('/2900001/'))).toBe(true)
    expect(r.ufsIncompletas).toEqual([])
    expect(r.ufsNaoVisitadas).toEqual(['TO', 'RJ'])
    expect(descricaoDaParada(r)).toBe('orçamento de downloads esgotado — ficaram para a próxima coleta: TO, RJ')
  })

  it('para no limite de buscas', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { dep } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA, { tempoMs: 3_600_000, buscas: 1, downloads: 100 })
    expect(buscasDeDiarios()).toHaveLength(1)
    expect(r.motivoDaParada).toBe('buscas')
    expect(r.ufsNaoVisitadas).toEqual(['TO', 'RJ'])
  })

  it('para quando o tempo da coleta acaba, mesmo no meio de uma UF', async () => {
    api(cidades, (params) => pagina([diario('BA', '2900001', 9), ...todos], params))
    const harness = dependencias()
    harness.dep.baixarTexto = vi.fn(async (url: string) => {
      harness.avancar(10 * 60_000)
      return aviso(Number(url.match(/(\d+)\.txt$/)?.[1]), 'Aquisição de material de consumo para a secretaria')
    })
    const r = await coletarQueridoDiario(harness.dep, JANELA, { tempoMs: 15 * 60_000, buscas: 50, downloads: 100 })
    expect(r.motivoDaParada).toBe('tempo')
    expect(r.diariosLidos).toBe(2)
    expect(r.ufsIncompletas).toEqual(['BA'])
    expect(r.ufsNaoVisitadas).toEqual(['TO', 'RJ'])
  })

  it('não baixa de novo diário já lido numa coleta anterior', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { memoria } = memoriaEmTeste([todos[0].txt_url!, todos[2].txt_url!])
    const { dep } = dependencias({ memoria })
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(http.arquivos).toHaveBeenCalledTimes(2)
    expect(r.jaLidosAntes).toBe(2)
    expect(r.porUf.find((m) => m.uf === 'BA')).toMatchObject({ diariosEncontrados: 2, diariosLidos: 1, jaLidosAntes: 1 })
  })
})

describe('Querido Diário — bloqueio e falhas', () => {
  const todos = [diario('BA', '2900001', 1), diario('TO', '1700001', 2)]
  const cidades = [cidade('BA', 1), cidade('TO', 1)]

  it('espera e tenta de novo quando a API devolve 429', async () => {
    let chamadas = 0
    api(cidades, (params) => (++chamadas === 1 ? erroHttp(429) : pagina(todos, params)))
    const { dep, esperas } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(esperas).toContain(ESPERA_APOS_BLOQUEIO_MS)
    expect(r.motivoDaParada).toBe('concluida')
    expect(r.diariosLidos).toBe(2)
  })

  it('para a coleta inteira quando o bloqueio (403) continua depois das esperas', async () => {
    api(cidades, () => erroHttp(403))
    const { dep, esperas } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(buscasDeDiarios()).toHaveLength(3)
    expect(esperas.filter((ms) => ms >= ESPERA_APOS_BLOQUEIO_MS)).toEqual([ESPERA_APOS_BLOQUEIO_MS, 2 * ESPERA_APOS_BLOQUEIO_MS])
    expect(r.motivoDaParada).toBe('bloqueio')
    expect(r.houveFalhas).toBe(true)
    expect(r.ufsIncompletas).toEqual(['BA'])
    expect(r.ufsNaoVisitadas).toEqual(['TO'])
  })

  it('erro comum na busca tenta uma vez de novo e depois passa para a próxima UF', async () => {
    api(cidades, (params) => ((params.territory_ids as string[])[0] === '2900001' ? erroHttp(502) : pagina(todos, params)))
    const { dep } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(buscasDeDiarios()).toHaveLength(3)
    expect(r.falhasDeBusca).toBe(1)
    expect(r.ufsIncompletas).toEqual(['BA'])
    expect(r.porUf.map((m) => m.uf)).toEqual(['TO'])
    expect(r.motivoDaParada).toBe('concluida')
  })

  it('para de baixar textos depois de bloqueios seguidos no servidor de arquivos', async () => {
    const muitos = Array.from({ length: 6 }, (_, i) => diario('BA', '2900001', i + 1))
    api(cidades, (params) => pagina(muitos, params))
    http.arquivos.mockRejectedValue(erroHttp(403))
    const { dep, lidos } = dependencias()
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(http.arquivos).toHaveBeenCalledTimes(BLOQUEIOS_SEGUIDOS_NOS_ARQUIVOS)
    expect(r.motivoDaParada).toBe('bloqueio')
    expect(r.falhasDeTexto).toBe(BLOQUEIOS_SEGUIDOS_NOS_ARQUIVOS)
    expect(lidos.size).toBe(0)
  })

  it('não marca como lido o diário cujo aviso não foi salvo', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { dep, lidos } = dependencias({
      salvarLote: vi.fn(async () => ({ totalNew: 0, totalDupes: 0, totalUpdated: 0 })),
    })
    await coletarQueridoDiario(dep, JANELA)
    expect(lidos.size).toBe(0)
  })
})

describe('Querido Diário — duplicidade com o PNCP na coleta', () => {
  it('descarta pelo identificador do PNCP e pela comparação, e salva só o aviso novo', async () => {
    const texto =
      aviso(10, 'Aquisição de merenda escolar', 'ID da Contratação PNCP nº: 13988308000139-1-000179/2026') +
      aviso(11, 'Aquisição de combustíveis para a frota municipal') +
      aviso(12, 'Reforma da quadra poliesportiva do bairro centro')
    api([cidade('BA', 1)], (params) => pagina([diario('BA', '2900001', 1)], params))
    http.arquivos.mockResolvedValue({ data: texto })
    const existeNoPncp = vi.fn(async (t: NormalizedTender) => t.objeto.includes('combustíveis'))
    const { dep, salvos, lidos } = dependencias({ existeNoPncp })

    const r = await coletarQueridoDiario(dep, JANELA)

    expect(salvos.map((t) => t.numeroControle)).toEqual(['Pregão Eletrônico nº 12/2026'])
    expect(r.descartadosPorPncp).toBe(1)
    expect(r.duplicadosDoPncp).toBe(1)
    expect(r.porUf).toEqual([
      expect.objectContaining({ uf: 'BA', diariosLidos: 1, avisos: 3, novos: 1, duplicadosDoPncp: 2 }),
    ])
    expect(lidos.size).toBe(1)
  })
})

describe('Querido Diário — memória de diários lidos no Redis', () => {
  function redisFalso() {
    const dados = new Map<string, number>()
    const redis = {
      zremrangebyscore: vi.fn(async () => 0),
      zadd: vi.fn(async (_chave: string, pontuacao: number, membro: string) => {
        dados.set(membro, pontuacao)
        return 1
      }),
      pipeline: () => {
        const membros: string[] = []
        return {
          zscore: (_chave: string, membro: string) => membros.push(membro),
          exec: async () => membros.map((m) => [null, dados.has(m) ? String(dados.get(m)) : null] as [Error | null, unknown]),
        }
      },
    }
    return { redis, dados }
  }

  it('lembra os diários lidos e esquece os antigos uma vez por coleta', async () => {
    const { redis } = redisFalso()
    const memoria = memoriaDeDiariosNoRedis(redis, () => INICIO)
    await memoria.marcarLido('a.txt')
    expect([...(await memoria.jaLidos(['a.txt', 'b.txt']))]).toEqual(['a.txt'])
    await memoria.jaLidos(['b.txt'])
    expect(redis.zremrangebyscore).toHaveBeenCalledTimes(1)
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(CHAVE_DOS_DIARIOS_LIDOS, '-inf', INICIO - 40 * 86_400_000)
  })

  it('com o Redis fora do ar, segue a coleta lendo tudo', async () => {
    const memoria = memoriaDeDiariosNoRedis({
      zremrangebyscore: async () => {
        throw new Error('down')
      },
      zadd: async () => {
        throw new Error('down')
      },
      pipeline: () => ({ zscore: () => undefined, exec: async () => null }),
    })
    expect((await memoria.jaLidos(['a.txt'])).size).toBe(0)
    await expect(memoria.marcarLido('a.txt')).resolves.toBeUndefined()
  })
})

describe('Querido Diário — status e mensagem da coleta coerentes', () => {
  const todos = [diario('BA', '2900001', 1), diario('TO', '1700001', 2)]
  const cidades = [cidade('BA', 1), cidade('TO', 1)]

  it('bloqueio logo na primeira busca é FAILED e diz o motivo real, sem "Coleta parcial" nem contadores zerados', async () => {
    api(cidades, () => erroHttp(403))
    const { dep } = dependencias()
    const d = desfechoDaColeta(await coletarQueridoDiario(dep, JANELA))
    expect(d.status).toBe('FAILED')
    expect(d.mensagem).toBe(
      'Nenhum diário lido: Querido Diário bloqueou as requisições (403/429) — ficaram para a próxima coleta: BA, TO — ver logs do worker'
    )
    expect(d.mensagem).not.toMatch(/parcial|\b0 /)
  })

  it('uma UF com falha e outra lida é PARTIAL e só cita o que falhou', async () => {
    api(cidades, (params) => ((params.territory_ids as string[])[0] === '2900001' ? erroHttp(502) : pagina(todos, params)))
    const { dep } = dependencias()
    const d = desfechoDaColeta(await coletarQueridoDiario(dep, JANELA))
    expect(d).toEqual({ status: 'PARTIAL', mensagem: 'Coleta parcial (1 diário(s) lido(s)): 1 busca(s) com falha — ver logs do worker' })
  })

  it('erro ao gravar entra na mensagem com a contagem', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { dep } = dependencias({ salvarLote: vi.fn(async () => Promise.reject(new Error('banco fora'))) })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await coletarQueridoDiario(dep, JANELA)
    expect(r.falhasAoGravar).toBe(2)
    expect(desfechoDaColeta(r)).toEqual({
      status: 'PARTIAL',
      mensagem: 'Coleta parcial (2 diário(s) lido(s)): 2 aviso(s) que não deu para conferir ou gravar — ver logs do worker',
    })
  })

  it('sem falha é SUCCESS sem mensagem de erro', async () => {
    api(cidades, (params) => pagina(todos, params))
    const { dep } = dependencias()
    expect(desfechoDaColeta(await coletarQueridoDiario(dep, JANELA))).toEqual({ status: 'SUCCESS' })
  })
})
