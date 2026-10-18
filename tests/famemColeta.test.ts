import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedTender } from '../src/types'
import {
  CHAVE_DAS_PUBLICACOES_LIDAS,
  DependenciasDaColetaFamem,
  ESPACO_ENTRE_REQUISICOES_MS,
  ESPERAS_APOS_ERRO_DO_SERVIDOR_MS,
  LIMITES_PADRAO_FAMEM,
  LimitesDaColetaFamem,
  coletarDaFamem,
  descricaoDaParadaFamem,
  janelaDaFamem,
  memoriaDaFamemNoRedis,
  resumoDaColetaFamem,
  statusDaColetaFamem,
} from '../src/services/famemColeta'
import type { MemoriaDeDiarios } from '../src/services/queridoDiarioColeta'

const PASTA = join(__dirname, 'fixtures', 'famem')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const INICIO = new Date('2026-10-18T15:00:00Z').getTime()
const AVISOS = ['713878', '713802', '713794', '713683']
const LISTA_COMPLETA = JSON.parse(fixture('lista-de-publicacoes.json')) as { data: { TDC_ID: string }[] }

function listaSem(...ids: string[]): string {
  const data = LISTA_COMPLETA.data.filter((p) => !ids.includes(p.TDC_ID))
  return JSON.stringify({ draw: '1', recordsTotal: data.length, recordsFiltered: data.length, data })
}

const LISTA = listaSem('711720')

function erroHttp(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

function erroDeRede(code: string) {
  return Object.assign(new Error(code), { code })
}

type Resposta = string | Error | ((tentativa: number) => string | Error)

interface Cenario {
  sessao?: Resposta
  lista?: Resposta
  publicacoes?: Record<string, Resposta>
  existeNoPncp?: (t: NormalizedTender) => boolean
  jaLidas?: string[]
  passoDoRelogioMs?: number
}

function montar(cenario: Cenario = {}) {
  const pedidos: string[] = []
  const tentativas = new Map<string, number>()
  const esperas: number[] = []
  const lotes: NormalizedTender[][] = []
  const lidas = new Set(cenario.jaLidas ?? [])
  let relogio = INICIO

  const responder = (chave: string, resposta: Resposta | undefined, padrao: () => string): string => {
    pedidos.push(chave)
    const tentativa = (tentativas.get(chave) ?? 0) + 1
    tentativas.set(chave, tentativa)
    relogio += cenario.passoDoRelogioMs ?? 0
    const valor = resposta === undefined ? padrao() : typeof resposta === 'function' ? resposta(tentativa) : resposta
    if (valor instanceof Error) throw valor
    return valor
  }

  const memoria: MemoriaDeDiarios = {
    jaLidos: vi.fn(async (chaves: string[]) => new Set(chaves.filter((c) => lidas.has(c)))),
    marcarLido: vi.fn(async (chave: string) => {
      lidas.add(chave)
    }),
  }

  const dep: DependenciasDaColetaFamem = {
    rede: {
      abrirSessao: async () => responder('sessao', cenario.sessao, () => 'ci_session=abc123def456'),
      baixarLista: async (cookie) => {
        expect(cookie).toBe('ci_session=abc123def456')
        return responder('lista', cenario.lista, () => LISTA)
      },
      baixarPublicacao: async (id) => responder(`publicacao:${id}`, cenario.publicacoes?.[id], () => fixture(`publicacao-${id}.html`)),
    },
    existeNoPncp: vi.fn(async (t: NormalizedTender) => cenario.existeNoPncp?.(t) ?? false),
    existeNoQueridoDiario: vi.fn(async () => false),
    prepararRepublicacao: vi.fn(async (t: NormalizedTender) => t),
    salvarLote: vi.fn(async (lote: NormalizedTender[]) => {
      lotes.push(lote)
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    }),
    memoria,
    esperar: vi.fn(async (ms: number) => {
      esperas.push(ms)
    }),
    agora: () => relogio,
  }
  return { dep, pedidos, esperas, lotes, lidas, memoria }
}

const limites = (parcial: Partial<LimitesDaColetaFamem> = {}): LimitesDaColetaFamem => ({ ...LIMITES_PADRAO_FAMEM, ...parcial })

describe('coleta da FAMEM — caminho feliz', () => {
  it('abre a sessão, baixa a lista uma vez e lê só os avisos, do mais novo ao mais antigo', async () => {
    const { dep, pedidos, esperas, lotes, lidas } = montar()
    const r = await coletarDaFamem(dep)

    expect(pedidos).toEqual(['sessao', 'lista', ...AVISOS.map((id) => `publicacao:${id}`)])
    expect(esperas).toEqual(Array(pedidos.length - 1).fill(ESPACO_ENTRE_REQUISICOES_MS))
    expect(r).toMatchObject({
      motivoDaParada: 'concluida',
      houveFalhas: false,
      requisicoes: 6,
      publicacoesNaLista: 10,
      naJanela: 10,
      outrosAtos: 4,
      contratacoesDiretasPeloTitulo: 2,
      semMunicipio: 0,
      candidatas: 4,
      lidas: 4,
      comSessaoFutura: 4,
      totalNew: 4,
      duplicadosDoPncp: 0,
      municipiosEnviados: ['2101400', '2104073', '2104305', '2109502'],
    })
    expect(lotes.flat().map((t) => t.fonteId).sort()).toEqual([
      'FAMEM-2101400:CONCORRENCIA:14-2026',
      'FAMEM-2104073:PREGAO:10-2026',
      'FAMEM-2104305:PREGAO:18-2026',
      'FAMEM-2109502:PREGAO:90020-2026',
    ])
    expect([...lidas].sort()).toEqual([...AVISOS].sort())
    expect(statusDaColetaFamem(r)).toBe('SUCCESS')
    expect(descricaoDaParadaFamem(r)).toBeNull()
    expect(resumoDaColetaFamem(r)).toContain('novas: 4')
  })

  it('na coleta seguinte não relê o que já leu', async () => {
    const { dep, pedidos } = montar({ jaLidas: AVISOS })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao', 'lista'])
    expect(r).toMatchObject({ jaLidasAntes: 4, lidas: 0, totalNew: 0, motivoDaParada: 'concluida' })
  })

  it('fora da janela de 30 dias não é lida', async () => {
    const { dep, pedidos } = montar()
    await coletarDaFamem(dep, limites({ diasDaJanela: 3 }))
    expect(pedidos).toEqual(['sessao', 'lista', 'publicacao:713878', 'publicacao:713802', 'publicacao:713794'])
    expect(janelaDaFamem(new Date(INICIO), 3)).toEqual({ dataInicio: '2026-10-16', dataFim: '2026-10-18' })
  })

  it('o que o PNCP já tem não é gravado e a publicação conta como lida', async () => {
    const { dep, lotes, lidas } = montar({ existeNoPncp: (t) => t.municipioIbge === '2109502' })
    const r = await coletarDaFamem(dep)
    expect(r.duplicadosDoPncp).toBe(1)
    expect(lotes.flat().some((t) => t.municipioIbge === '2109502')).toBe(false)
    expect(lidas.has('713683')).toBe(true)
  })

  it('publicação de entidade diferente da lista conta como falha de leitura e não é marcada', async () => {
    const { dep, lidas } = montar({ publicacoes: { '713794': fixture('publicacao-713878.html') } })
    const r = await coletarDaFamem(dep)
    expect(r).toMatchObject({ falhasDeLeitura: 1, lidas: 3, houveFalhas: true, motivoDaParada: 'concluida' })
    expect(lidas.has('713794')).toBe(false)
    expect(statusDaColetaFamem(r)).toBe('PARTIAL')
  })
})

describe('coleta da FAMEM — bloqueio e erros do servidor', () => {
  it('403 na lista para a coleta na hora, sem nova tentativa', async () => {
    const { dep, pedidos } = montar({ lista: erroHttp(403) })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao', 'lista'])
    expect(r).toMatchObject({ motivoDaParada: 'bloqueio', houveFalhas: true })
    expect(statusDaColetaFamem(r)).toBe('FAILED')
  })

  it('429 numa publicação para tudo e deixa o resto para a próxima coleta', async () => {
    const { dep, pedidos, lidas } = montar({ publicacoes: { '713802': erroHttp(429) } })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao', 'lista', 'publicacao:713878', 'publicacao:713802'])
    expect(r).toMatchObject({ motivoDaParada: 'bloqueio', lidas: 1, pendentes: 2 })
    expect(lidas.has('713802')).toBe(false)
    expect(statusDaColetaFamem(r)).toBe('PARTIAL')
    expect(descricaoDaParadaFamem(r)).toMatch(/recusou.*2 publicação/)
  })

  it('redirecionamento (página de desafio) também para a coleta', async () => {
    const { dep, pedidos } = montar({ sessao: erroHttp(302) })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao'])
    expect(r.motivoDaParada).toBe('bloqueio')
  })

  it('5xx tenta de novo com espera espaçada', async () => {
    const { dep, pedidos, esperas } = montar({
      publicacoes: { '713878': (tentativa) => (tentativa === 1 ? erroHttp(502) : fixture('publicacao-713878.html')) },
    })
    const r = await coletarDaFamem(dep)
    expect(pedidos.filter((p) => p === 'publicacao:713878')).toHaveLength(2)
    expect(esperas).toContain(ESPERAS_APOS_ERRO_DO_SERVIDOR_MS[0])
    expect(r).toMatchObject({ lidas: 4, falhasDeLeitura: 0, houveFalhas: false })
  })

  it('5xx que não passa desiste daquela publicação depois das tentativas e segue', async () => {
    const { dep, pedidos, esperas } = montar({ publicacoes: { '713878': erroHttp(503) } })
    const r = await coletarDaFamem(dep)
    expect(pedidos.filter((p) => p === 'publicacao:713878')).toHaveLength(ESPERAS_APOS_ERRO_DO_SERVIDOR_MS.length + 1)
    expect(esperas.filter((e) => e > ESPACO_ENTRE_REQUISICOES_MS)).toEqual(ESPERAS_APOS_ERRO_DO_SERVIDOR_MS)
    expect(r).toMatchObject({ lidas: 3, falhasDeLeitura: 1, houveFalhas: true, motivoDaParada: 'concluida' })
  })

  it('queda de conexão é tratada como erro passageiro', async () => {
    const { dep } = montar({ publicacoes: { '713878': (tentativa) => (tentativa === 1 ? erroDeRede('ECONNRESET') : fixture('publicacao-713878.html')) } })
    const r = await coletarDaFamem(dep)
    expect(r).toMatchObject({ lidas: 4, falhasDeLeitura: 0 })
  })

  it('404 não é repetido', async () => {
    const { dep, pedidos } = montar({ publicacoes: { '713878': erroHttp(404) } })
    const r = await coletarDaFamem(dep)
    expect(pedidos.filter((p) => p === 'publicacao:713878')).toHaveLength(1)
    expect(r.falhasDeLeitura).toBe(1)
  })

  it('três páginas ilegíveis seguidas param a coleta', async () => {
    const ilegivel = fixture('publicacao-inexistente.html')
    const { dep, pedidos } = montar({ publicacoes: { '713878': ilegivel, '713802': ilegivel, '713794': ilegivel } })
    const r = await coletarDaFamem(dep)
    expect(pedidos).not.toContain('publicacao:713683')
    expect(r).toMatchObject({ motivoDaParada: 'falhas', falhasDeLeitura: 3, pendentes: 1 })
  })
})

describe('coleta da FAMEM — lista e sessão', () => {
  it('lista vazia (sessão não reconhecida) é falha, não "sem publicações"', async () => {
    const { dep, pedidos } = montar({ lista: '{"draw":"1","recordsTotal":0,"recordsFiltered":0,"data":[]}' })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao', 'lista'])
    expect(r).toMatchObject({ motivoDaParada: 'listaVazia', houveFalhas: true })
    expect(statusDaColetaFamem(r)).toBe('FAILED')
  })

  it('lista que não é JSON é falha', async () => {
    const { dep } = montar({ lista: '<html><body>Verificando seu navegador</body></html>' })
    const r = await coletarDaFamem(dep)
    expect(r.motivoDaParada).toBe('listaIlegivel')
    expect(statusDaColetaFamem(r)).toBe('FAILED')
  })

  it('sem o cookie da sessão não pede a lista', async () => {
    const { dep, pedidos } = montar({ sessao: new Error('A FAMEM não devolveu o cookie ci_session na página de publicações') })
    const r = await coletarDaFamem(dep)
    expect(pedidos).toEqual(['sessao'])
    expect(r.motivoDaParada).toBe('semSessao')
  })
})

describe('coleta da FAMEM — tetos', () => {
  it('teto de requisições', async () => {
    const { dep, pedidos } = montar()
    const r = await coletarDaFamem(dep, limites({ maxRequisicoes: 4 }))
    expect(pedidos).toHaveLength(4)
    expect(r).toMatchObject({ motivoDaParada: 'requisicoes', lidas: 2, pendentes: 2 })
    expect(statusDaColetaFamem(r)).toBe('PARTIAL')
  })

  it('teto de publicações por coleta', async () => {
    const { dep } = montar()
    const r = await coletarDaFamem(dep, limites({ maxPublicacoesLidas: 1 }))
    expect(r).toMatchObject({ motivoDaParada: 'publicacoes', lidas: 1, pendentes: 3 })
  })

  it('teto de tempo', async () => {
    const { dep } = montar({ passoDoRelogioMs: 60_000 })
    const r = await coletarDaFamem(dep, limites({ tempoMaximoMs: 3 * 60_000 }))
    expect(r).toMatchObject({ motivoDaParada: 'tempo', lidas: 1 })
  })

  it('teto de itens da lista', async () => {
    const { dep } = montar()
    const r = await coletarDaFamem(dep, limites({ maxItensNaLista: 2 }))
    expect(r).toMatchObject({ publicacoesNaLista: 10, naJanela: 2 })
  })
})

describe('memória da FAMEM no Redis', () => {
  it('guarda o identificador da publicação no sorted set da FAMEM', async () => {
    const zadd = vi.fn(async () => 1)
    const redis = {
      pipeline: () => ({ zscore: vi.fn(), exec: vi.fn(async () => [[null, '1'], [null, null]] as [Error | null, unknown][]) }),
      zadd,
      zremrangebyscore: vi.fn(async () => 0),
    }
    const memoria = memoriaDaFamemNoRedis(redis, () => INICIO)
    expect(await memoria.jaLidos(['713794', '713802'])).toEqual(new Set(['713794']))
    await memoria.marcarLido('713878')
    expect(zadd).toHaveBeenCalledWith(CHAVE_DAS_PUBLICACOES_LIDAS, INICIO, '713878')
  })
})
