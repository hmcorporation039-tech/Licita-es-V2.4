import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedTender } from '../src/types'

const http = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../src/lib/httpClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/httpClient')>()),
  diarioMunicipalClient: { get: http.get },
}))

import {
  CHAVE_DAS_MATERIAS_LIDAS,
  DependenciasDaColeta,
  ESPACO_ENTRE_REQUISICOES_MS,
  ESPERA_ANTES_DE_REPETIR_MS,
  ESPERA_APOS_BLOQUEIO_MS,
  FALHAS_SEGUIDAS_PARA_PARAR,
  coletarDiarioMunicipal,
  descricaoDaParada,
  memoriaDeMateriasNoRedis,
  resumoDaAssociacao,
  resumoPorUf,
} from '../src/services/diarioMunicipalColeta'
import { ASSOCIACOES_SIGPUB, AssociacaoSigpub } from '../src/services/diarioMunicipalParser'
import { baixarMateria, buscarMaterias } from '../src/services/diarioMunicipalService'
import type { MemoriaDeDiarios } from '../src/services/queridoDiarioColeta'

const PASTA = join(__dirname, 'fixtures', 'sigpub')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const BUSCA_PAGINA_1 = fixture('busca-famup-pagina-1.html')
const BUSCA_ULTIMA = fixture('busca-famup-pagina-3.html')
const BUSCA_VAZIA = fixture('busca-amm-mt-sem-resultado.html')
const MATERIA_MODELO = fixture('materia-famup-3D2DAFAD.html')

const JANELA = { dataInicio: '2026-10-13', dataFim: '2026-10-17' }
const INICIO = new Date('2026-10-17T15:00:00Z').getTime()
const FAMUP = ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famup')!
const FAMEP = ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famep')!
const AMM_MT = ASSOCIACOES_SIGPUB.find((a) => a.slug === 'amm-mt')!
const UM_TERMO = ['aviso de licitação']

const CANDIDATOS_DA_PAGINA_1 = 19
const CANDIDATOS_DA_ULTIMA = 6

function materiaComCodigo(codigo: string): string {
  const numero = String(parseInt(codigo.slice(0, 6), 16) % 900 + 1).padStart(5, '0')
  return MATERIA_MODELO.split('3D2DAFAD').join(codigo).split('00020/2026').join(`${numero}/2026`)
}

function erroHttp(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

type Rota = (caminho: string, params: Record<string, string>) => string | Error

function rotear(rota: Rota) {
  http.get.mockImplementation(async (caminho: string, config: { params?: Record<string, string> } = {}) => {
    const resposta = rota(caminho, config.params ?? {})
    if (resposta instanceof Error) throw resposta
    return { data: resposta }
  })
}

function rotaPadrao(paginas: Record<string, string[]> = { famup: [BUSCA_PAGINA_1, BUSCA_ULTIMA] }): Rota {
  return (caminho, params) => {
    const busca = /^\/([a-z-]+)\/pesquisar$/.exec(caminho)
    if (busca) return paginas[busca[1]]?.[Number(params['busca_avancada[pagina]']) - 1] ?? BUSCA_VAZIA
    const materia = /^\/([a-z-]+)\/materia\/([0-9A-Z]+)$/.exec(caminho)
    if (materia) return materiaComCodigo(materia[2])
    return erroHttp(404)
  }
}

function pedidos(tipo: 'pesquisar' | 'materia'): [string, Record<string, string>][] {
  return http.get.mock.calls.filter(([caminho]) => String(caminho).includes(`/${tipo}`)).map(([c, config]) => [c, config?.params ?? {}])
}

function memoriaEmTeste(jaLidas: string[] = []) {
  const lidas = new Set(jaLidas)
  const memoria: MemoriaDeDiarios = {
    jaLidos: vi.fn(async (chaves: string[]) => new Set(chaves.filter((c) => lidas.has(c)))),
    marcarLido: vi.fn(async (chave: string) => {
      lidas.add(chave)
    }),
  }
  return { memoria, lidas }
}

function dependencias(over: Partial<DependenciasDaColeta> = {}, jaLidas: string[] = []) {
  let relogio = INICIO
  const esperas: number[] = []
  const salvos: NormalizedTender[] = []
  const { memoria, lidas } = memoriaEmTeste(jaLidas)
  const dep: DependenciasDaColeta = {
    buscar: buscarMaterias,
    baixarMateria,
    existeNoPncp: vi.fn(async () => false),
    existeNoQueridoDiario: vi.fn(async () => false),
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
  return { dep, esperas, salvos, lidas, avancar: (ms: number) => (relogio += ms) }
}

function coletar(dep: DependenciasDaColeta, associacoes: AssociacaoSigpub[] = [FAMUP], termos = UM_TERMO, requisicoes = 500) {
  return coletarDiarioMunicipal(dep, JANELA, { associacoes, termos, orcamento: { tempoMs: 3_600_000, requisicoes } })
}

beforeEach(() => {
  http.get.mockReset()
  rotear(rotaPadrao())
})

describe('Diário Municipal — busca e paginação', () => {
  it('manda os campos da busca avançada em UTF-8 e pede a matéria pelo código', async () => {
    await buscarMaterias(FAMUP, 'aviso de licitação', JANELA, 2)
    const [caminho, config] = http.get.mock.calls[0]
    expect(caminho).toBe('/famup/pesquisar')
    expect(config.responseType).toBe('text')
    const url = axios.getUri({ baseURL: 'https://www.diariomunicipal.com.br', url: caminho, params: config.params })
    expect(url).toBe(
      'https://www.diariomunicipal.com.br/famup/pesquisar?busca_avancada%5Btexto%5D=aviso+de+licita%C3%A7%C3%A3o' +
        '&busca_avancada%5BdataInicio%5D=2026-10-13&busca_avancada%5BdataFim%5D=2026-10-17' +
        '&busca_avancada%5Bordenacao%5D=recente&busca_avancada%5Bpagina%5D=2'
    )

    await baixarMateria(FAMEP, 'E4F6493E')
    expect(http.get.mock.calls[1][0]).toBe('/famep/materia/E4F6493E')
    await expect(baixarMateria(FAMEP, '../../x')).rejects.toThrow('Código de matéria inválido')
  })

  it('pagina até a última página, lê só as matérias que passam pelo título e mede a associação', async () => {
    const { dep, salvos, lidas, esperas } = dependencias()
    const r = await coletar(dep)

    expect(pedidos('pesquisar').map(([, p]) => p['busca_avancada[pagina]'])).toEqual(['1', '2'])
    expect(pedidos('materia')).toHaveLength(CANDIDATOS_DA_PAGINA_1 + CANDIDATOS_DA_ULTIMA)
    expect(pedidos('materia').map(([c]) => c)).not.toContain('/famup/materia/9CAF21A3')
    expect(r.motivoDaParada).toBe('concluida')
    expect(r.requisicoes).toBe(2 + CANDIDATOS_DA_PAGINA_1 + CANDIDATOS_DA_ULTIMA)
    expect(esperas.filter((ms) => ms === ESPACO_ENTRE_REQUISICOES_MS)).toHaveLength(r.requisicoes - 1)
    expect(r.porAssociacao).toEqual([
      expect.objectContaining({
        associacao: 'famup',
        uf: 'PB',
        buscas: 2,
        materiasEncontradas: 33,
        descartadasPeloTitulo: 8,
        materiasLidas: 25,
        semMunicipio: 0,
        novos: 25,
        avisos: 25,
      }),
    ])
    expect(salvos.every((t) => t.fonte === 'DIARIO_MUNICIPAL' && t.uf === 'PB' && t.fonteId.startsWith('DM-'))).toBe(true)
    expect(new Set(salvos.map((t) => t.municipioIbge)).size).toBeGreaterThan(10)
    expect(lidas.size).toBe(25)
    expect([...lidas].every((c) => c.startsWith('famup:'))).toBe(true)
    expect(resumoDaAssociacao(r.porAssociacao[0])).toContain('famup (PB) — buscas: 2; matérias: 33 encontradas, 8 descartadas pelo título')
    expect(resumoPorUf(r)).toBe('PB: 25 lidas, 25 avisos, 25 novos, 0 já no PNCP')
    expect(descricaoDaParada(r)).toBeNull()
  })

  it('a mesma matéria achada por outro termo não é lida de novo', async () => {
    rotear(rotaPadrao({ famup: [BUSCA_ULTIMA] }))
    const { dep } = dependencias()
    const r = await coletar(dep, [FAMUP], ['aviso de licitação', 'pregão eletrônico'])
    expect(pedidos('pesquisar').map(([, p]) => p['busca_avancada[texto]'])).toEqual(['aviso de licitação', 'pregão eletrônico'])
    expect(pedidos('materia')).toHaveLength(CANDIDATOS_DA_ULTIMA)
    expect(r.porAssociacao[0].materiasEncontradas).toBe(8)
  })

  it('associação sem nenhuma matéria no primeiro termo pula os demais termos', async () => {
    const { dep } = dependencias()
    const r = await coletar(dep, [AMM_MT, FAMUP], ['aviso de licitação', 'pregão eletrônico', 'concorrência'])
    expect(pedidos('pesquisar').filter(([c]) => c === '/amm-mt/pesquisar')).toHaveLength(1)
    expect(r.porAssociacao[0]).toMatchObject({ associacao: 'amm-mt', buscas: 1, semPublicacoesNaJanela: true })
    expect(resumoDaAssociacao(r.porAssociacao[0])).toContain('(sem publicações na janela)')
    expect(r.porAssociacao[1].associacao).toBe('famup')
  })

  it('não relê matéria lembrada da coleta anterior e só lembra a que foi gravada por inteiro', async () => {
    rotear(rotaPadrao({ famup: [BUSCA_ULTIMA] }))
    const salvarLote = vi.fn(async (lote: NormalizedTender[]) => {
      if (lote.some((t) => t.rawJson.codigo === '3C40E635')) throw new Error('banco fora')
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    })
    const { dep, lidas } = dependencias({ salvarLote }, ['famup:0CC79DB2', 'famup:5F573112'])
    const r = await coletar(dep)
    expect(pedidos('materia').map(([c]) => c)).not.toContain('/famup/materia/0CC79DB2')
    expect(r.jaLidasAntes).toBe(2)
    expect(r.materiasLidas).toBe(CANDIDATOS_DA_ULTIMA - 2)
    expect(lidas.has('famup:3C40E635')).toBe(false)
    expect(lidas.has('famup:B61D43EC')).toBe(true)
    expect(r.houveFalhas).toBe(true)
  })
})

describe('Diário Municipal — duplicidade', () => {
  it('descarta o que já está no PNCP ou no Querido Diário e conta a republicação idêntica como inalterada', async () => {
    rotear(rotaPadrao({ famup: [BUSCA_ULTIMA] }))
    let n = 0
    const existeNoPncp = vi.fn(async () => n++ === 0)
    const existeNoQueridoDiario = vi.fn(async (t: NormalizedTender) => t.rawJson.codigo === '5F573112')
    const prepararRepublicacao = vi.fn(async (t: NormalizedTender) => (t.rawJson.codigo === 'B61D43EC' ? null : t))
    const { dep, salvos } = dependencias({ existeNoPncp, existeNoQueridoDiario, prepararRepublicacao })
    const r = await coletar(dep)

    expect(r.porAssociacao[0]).toMatchObject({ avisos: 6, duplicadosDoPncp: 1, duplicadosDoQueridoDiario: 1, inalterados: 1, novos: 3 })
    expect(r.duplicadosDoPncp).toBe(1)
    expect(r.duplicadosDoQueridoDiario).toBe(1)
    expect(salvos).toHaveLength(3)
    expect(salvos.map((t) => t.rawJson.codigo)).not.toContain('5F573112')
  })

  it('aviso com identificador do PNCP no texto nem chega à comparação', async () => {
    rotear((caminho, params) => {
      if (caminho.endsWith('/materia/0CC79DB2')) {
        return materiaComCodigo('0CC79DB2').replace('Edital disponível no PNCP', 'ID PNCP 08862480000159-1-000020/2026')
      }
      return rotaPadrao({ famup: [BUSCA_ULTIMA] })(caminho, params)
    })
    const existeNoPncp = vi.fn(async () => false)
    const { dep } = dependencias({ existeNoPncp })
    const r = await coletar(dep)
    expect(r.descartadosPorPncp).toBe(1)
    expect(r.porAssociacao[0].duplicadosDoPncp).toBe(1)
    expect(existeNoPncp).toHaveBeenCalledTimes(CANDIDATOS_DA_ULTIMA - 1)
  })
})

describe('Diário Municipal — orçamento e bloqueio', () => {
  it('para no limite de requisições e deixa as associações restantes para a próxima coleta', async () => {
    const { dep } = dependencias()
    const r = await coletar(dep, [FAMUP, FAMEP, AMM_MT], UM_TERMO, 5)
    expect(r.requisicoes).toBe(5)
    expect(r.motivoDaParada).toBe('requisicoes')
    expect(r.associacoesIncompletas).toEqual(['famup'])
    expect(r.associacoesNaoVisitadas).toEqual(['famep', 'amm-mt'])
    expect(descricaoDaParada(r)).toBe('orçamento de requisições esgotado — ficaram para a próxima coleta: famup, famep, amm-mt')
  })

  it('para quando o tempo da coleta acaba', async () => {
    const harness = dependencias()
    harness.dep.baixarMateria = vi.fn(async (associacao, codigo) => {
      harness.avancar(20 * 60_000)
      return materiaComCodigo(codigo)
    })
    const r = await coletar(harness.dep, [FAMUP, FAMEP])
    expect(r.motivoDaParada).toBe('tempo')
    expect(r.materiasLidas).toBe(3)
    expect(r.associacoesNaoVisitadas).toEqual(['famep'])
  })

  it('403 na busca espera, tenta mais uma vez e, se continuar, para a coleta inteira', async () => {
    rotear((caminho) => (caminho.endsWith('/pesquisar') ? erroHttp(403) : materiaComCodigo('3D2DAFAD')))
    const { dep, esperas } = dependencias()
    const r = await coletar(dep, [FAMUP, FAMEP])
    expect(pedidos('pesquisar')).toHaveLength(2)
    expect(esperas).toContain(ESPERA_APOS_BLOQUEIO_MS)
    expect(r.motivoDaParada).toBe('bloqueio')
    expect(r.houveFalhas).toBe(true)
    expect(r.associacoesIncompletas).toEqual(['famup'])
    expect(r.associacoesNaoVisitadas).toEqual(['famep'])
    expect(descricaoDaParada(r)).toContain('SIGPub bloqueou as requisições (403/429)')
  })

  it('429 passageiro numa matéria espera e segue a coleta', async () => {
    let primeira = true
    rotear((caminho, params) => {
      if (caminho.includes('/materia/') && primeira) {
        primeira = false
        return erroHttp(429)
      }
      return rotaPadrao({ famup: [BUSCA_ULTIMA] })(caminho, params)
    })
    const { dep, esperas } = dependencias()
    const r = await coletar(dep)
    expect(esperas.filter((ms) => ms === ESPERA_APOS_BLOQUEIO_MS)).toHaveLength(1)
    expect(r.motivoDaParada).toBe('concluida')
    expect(r.materiasLidas).toBe(CANDIDATOS_DA_ULTIMA)
  })

  it('erro comum repete uma vez; matéria que não abre é contada e a coleta continua', async () => {
    rotear((caminho, params) => (caminho.endsWith('/materia/0CC79DB2') ? erroHttp(500) : rotaPadrao({ famup: [BUSCA_ULTIMA] })(caminho, params)))
    const { dep, esperas } = dependencias()
    const r = await coletar(dep)
    expect(pedidos('materia').filter(([c]) => c.endsWith('/0CC79DB2'))).toHaveLength(2)
    expect(esperas).toContain(ESPERA_ANTES_DE_REPETIR_MS)
    expect(r.falhasDeLeitura).toBe(1)
    expect(r.materiasLidas).toBe(CANDIDATOS_DA_ULTIMA - 1)
    expect(r.motivoDaParada).toBe('concluida')
    expect(r.houveFalhas).toBe(true)
  })

  it(`para depois de ${FALHAS_SEGUIDAS_PARA_PARAR} falhas seguidas`, async () => {
    rotear((caminho, params) => (caminho.includes('/materia/') ? erroHttp(502) : rotaPadrao()(caminho, params)))
    const { dep } = dependencias()
    const r = await coletar(dep, [FAMUP, FAMEP])
    expect(r.motivoDaParada).toBe('falhas')
    expect(r.falhasDeLeitura).toBe(FALHAS_SEGUIDAS_PARA_PARAR)
    expect(r.associacoesNaoVisitadas).toEqual(['famep'])
  })

  it('página da matéria sem corpo conta como falha de leitura sem parar a coleta', async () => {
    rotear((caminho, params) => (caminho.endsWith('/materia/0CC79DB2') ? BUSCA_VAZIA : rotaPadrao({ famup: [BUSCA_ULTIMA] })(caminho, params)))
    const { dep, lidas } = dependencias()
    const r = await coletar(dep)
    expect(r.falhasDeLeitura).toBe(1)
    expect(lidas.has('famup:0CC79DB2')).toBe(false)
    expect(r.materiasLidas).toBe(CANDIDATOS_DA_ULTIMA - 1)
  })
})

describe('Diário Municipal — memória no Redis', () => {
  it('usa uma chave própria, separada da do Querido Diário, e segue sem ela se o Redis cair', async () => {
    const zscores: [string, string][] = []
    const redis = {
      pipeline: () => {
        const membros: string[] = []
        return {
          zscore: (chave: string, membro: string) => {
            zscores.push([chave, membro])
            membros.push(membro)
          },
          exec: async () => membros.map((m) => [null, m === 'famup:AAAAAAAA' ? '1' : null] as [null, string | null]),
        }
      },
      zadd: vi.fn(async () => 1),
      zremrangebyscore: vi.fn(async () => 0),
    }
    const memoria = memoriaDeMateriasNoRedis(redis, () => INICIO)
    expect(await memoria.jaLidos(['famup:AAAAAAAA', 'famup:BBBBBBBB'])).toEqual(new Set(['famup:AAAAAAAA']))
    expect(zscores.every(([chave]) => chave === CHAVE_DAS_MATERIAS_LIDAS)).toBe(true)
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(CHAVE_DAS_MATERIAS_LIDAS, '-inf', INICIO - 20 * 86_400_000)
    await memoria.marcarLido('famup:BBBBBBBB')
    expect(redis.zadd).toHaveBeenCalledWith(CHAVE_DAS_MATERIAS_LIDAS, INICIO, 'famup:BBBBBBBB')

    const fora = memoriaDeMateriasNoRedis({
      pipeline: () => ({ zscore: () => undefined, exec: async () => Promise.reject(new Error('down')) }),
      zadd: async () => Promise.reject(new Error('down')),
      zremrangebyscore: async () => 0,
    })
    expect(await fora.jaLidos(['famup:AAAAAAAA'])).toEqual(new Set())
    await expect(fora.marcarLido('famup:AAAAAAAA')).resolves.toBeUndefined()
  })
})
