import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LimiteDeRequisicoesExcedido } from '../src/lib/httpClient'
import {
  CAMINHO_PROPOSTA_PNCP,
  ContratacaoPncp,
  ORCAMENTO_DE_TENTATIVAS_POR_EXECUCAO,
  PaginaPncp,
  ParametrosPncp,
  RedeDoPncp,
  RespostaInesperadaDoPncp,
  TAMANHO_PAGINA_PNCP,
  TENTATIVAS_EXTRAS_POR_PAGINA,
  coletarModalidadesPncp,
  ehFalhaTransitoria,
  lerPaginaPncp,
  parametrosDaVarreduraDePropostas,
  statusDaColeta,
} from '../src/services/pncpColeta'

const PAGINA_DE_LIMITE = '<!DOCTYPE html><html><head><title>PNCP</title></head><body><h1>Limite de requisições excedido</h1><p>Tente novamente mais tarde.</p></body></html>'

function erroHttp(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    code: status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    response: { status },
  })
}

function erroDeRede(code: string) {
  return Object.assign(new Error(code === 'ECONNABORTED' ? 'timeout of 30000ms exceeded' : 'socket hang up'), { isAxiosError: true, code })
}

function contratacoes(modalidade: number, pagina: number, quantidade = 2): ContratacaoPncp[] {
  return Array.from({ length: quantidade }, (_, i) => ({ numeroControlePNCP: `m${modalidade}-p${pagina}-${i}` }))
}

type Resposta = PaginaPncp | Error

function redeFalsa(respostas: (modalidade: number, pagina: number, vez: number) => Resposta) {
  const pedidos: ParametrosPncp[] = []
  const esperas: number[] = []
  const vezes = new Map<string, number>()
  const rede: RedeDoPncp = {
    buscarPagina: async (caminho, parametros) => {
      expect(caminho).toBe(CAMINHO_PROPOSTA_PNCP)
      pedidos.push(parametros)
      const chave = `${parametros.codigoModalidadeContratacao}:${parametros.pagina}`
      const vez = (vezes.get(chave) ?? 0) + 1
      vezes.set(chave, vez)
      const resposta = respostas(Number(parametros.codigoModalidadeContratacao), Number(parametros.pagina), vez)
      if (resposta instanceof Error) throw resposta
      return resposta
    },
    esperar: async (ms) => {
      esperas.push(ms)
    },
  }
  const sequencia = () => pedidos.map((p) => `${p.codigoModalidadeContratacao}:${p.pagina}`)
  return { rede, pedidos, esperas, sequencia }
}

function coleta(rede: RedeDoPncp, modalidades: number[]) {
  const gravados: string[] = []
  return {
    gravados,
    executar: () =>
      coletarModalidadesPncp({
        caminho: CAMINHO_PROPOSTA_PNCP,
        parametros: { dataFinal: '20361014' },
        contexto: 'teste',
        modalidades,
        rede,
        gravar: async (itens, contadores) => {
          for (const item of itens) {
            contadores.vistos++
            gravados.push(item.numeroControlePNCP)
          }
        },
      }),
  }
}

describe('lerPaginaPncp', () => {
  it('204 (página depois da última) é fim da paginação', () => {
    expect(lerPaginaPncp(CAMINHO_PROPOSTA_PNCP, 204, '')).toEqual({ itens: [], totalPaginas: 0 })
  })

  it('lê a página do PNCP com totalPaginas', () => {
    const corpo = { data: contratacoes(6, 1), totalRegistros: 6175, totalPaginas: 124, numeroPagina: 1, paginasRestantes: 123, empty: false }
    expect(lerPaginaPncp(CAMINHO_PROPOSTA_PNCP, 200, corpo)).toEqual({ itens: corpo.data, totalPaginas: 124 })
  })

  it('reconhece a página HTML de limite de requisições mesmo com HTTP 200', () => {
    expect(() => lerPaginaPncp(CAMINHO_PROPOSTA_PNCP, 200, PAGINA_DE_LIMITE)).toThrow(LimiteDeRequisicoesExcedido)
  })

  it('outro HTML no lugar do JSON vira erro, não lista vazia', () => {
    expect(() => lerPaginaPncp(CAMINHO_PROPOSTA_PNCP, 200, '<html><body>Manutenção</body></html>')).toThrow(RespostaInesperadaDoPncp)
  })
})

describe('ehFalhaTransitoria', () => {
  it('5xx, 429, timeout, queda de conexão e página de limite são transitórios', () => {
    for (const status of [429, 500, 502, 503, 504]) expect(ehFalhaTransitoria(erroHttp(status))).toBe(true)
    expect(ehFalhaTransitoria(erroDeRede('ECONNABORTED'))).toBe(true)
    expect(ehFalhaTransitoria(erroDeRede('ECONNRESET'))).toBe(true)
    expect(ehFalhaTransitoria(new LimiteDeRequisicoesExcedido('PNCP'))).toBe(true)
  })

  it('400/404 e erro de programação não são repetidos', () => {
    expect(ehFalhaTransitoria(erroHttp(400))).toBe(false)
    expect(ehFalhaTransitoria(erroHttp(404))).toBe(false)
    expect(ehFalhaTransitoria(new TypeError('x is undefined'))).toBe(false)
  })
})

describe('parametrosDaVarreduraDePropostas', () => {
  it('pede tudo que encerra nos próximos dez anos (dataFinal de hoje devolve 204)', () => {
    expect(parametrosDaVarreduraDePropostas(new Date('2026-10-17T12:00:00Z'))).toEqual({ dataFinal: '20361014' })
  })
})

describe('coletarModalidadesPncp — varredura de propostas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('pagina até totalPaginas, para no 204 e manda os parâmetros do endpoint de proposta', async () => {
    const { rede, pedidos, sequencia } = redeFalsa((modalidade, pagina) => {
      if (modalidade === 6) return { itens: contratacoes(6, pagina), totalPaginas: 3 }
      return { itens: [], totalPaginas: 0 }
    })
    const execucao = coleta(rede, [6, 8])
    const resumo = await execucao.executar()

    expect(sequencia()).toEqual(['6:1', '6:2', '6:3', '8:1'])
    expect(pedidos[0]).toEqual({ dataFinal: '20361014', codigoModalidadeContratacao: 6, pagina: 1, tamanhoPagina: TAMANHO_PAGINA_PNCP })
    expect(execucao.gravados).toHaveLength(6)
    expect(resumo.status).toBe('SUCCESS')
    expect(resumo.falhas).toEqual([])
    expect(resumo.contadores.vistos).toBe(6)
  })

  it('lista que encolhe durante a varredura (204 antes de totalPaginas) encerra a modalidade sem falha', async () => {
    const { rede, sequencia } = redeFalsa((_m, pagina) => (pagina < 3 ? { itens: contratacoes(6, pagina), totalPaginas: 5 } : { itens: [], totalPaginas: 0 }))
    const resumo = await coleta(rede, [6]).executar()
    expect(sequencia()).toEqual(['6:1', '6:2', '6:3'])
    expect(resumo.status).toBe('SUCCESS')
  })

  it('página de limite de requisições: espera e repete a MESMA página', async () => {
    const { rede, sequencia, esperas } = redeFalsa((_m, pagina, vez) =>
      pagina === 2 && vez === 1 ? new LimiteDeRequisicoesExcedido('PNCP') : { itens: contratacoes(6, pagina), totalPaginas: 3 }
    )
    const execucao = coleta(rede, [6])
    const resumo = await execucao.executar()
    expect(sequencia()).toEqual(['6:1', '6:2', '6:2', '6:3'])
    expect(esperas).toEqual([10_000])
    expect(execucao.gravados).toHaveLength(6)
    expect(resumo.status).toBe('SUCCESS')
    expect(resumo.tentativasExtras).toBe(1)
  })

  it('5xx e timeout no meio: retoma da página que falhou, sem abandonar a modalidade', async () => {
    const { rede, sequencia, esperas } = redeFalsa((_m, pagina, vez) => {
      if (pagina === 2 && vez === 1) return erroHttp(502)
      if (pagina === 2 && vez === 2) return erroDeRede('ECONNABORTED')
      return { itens: contratacoes(6, pagina), totalPaginas: 4 }
    })
    const execucao = coleta(rede, [6])
    const resumo = await execucao.executar()
    expect(sequencia()).toEqual(['6:1', '6:2', '6:2', '6:2', '6:3', '6:4'])
    expect(esperas).toEqual([10_000, 20_000])
    expect(execucao.gravados).toHaveLength(8)
    expect(resumo.status).toBe('SUCCESS')
  })

  it('página que nunca responde vira falha registrada, segue para a próxima e a execução fica PARTIAL', async () => {
    const { rede, sequencia } = redeFalsa((_m, pagina) => (pagina === 2 ? erroHttp(500) : { itens: contratacoes(6, pagina), totalPaginas: 3 }))
    const execucao = coleta(rede, [6])
    const resumo = await execucao.executar()
    expect(sequencia()).toEqual(['6:1', ...Array(TENTATIVAS_EXTRAS_POR_PAGINA + 1).fill('6:2'), '6:3'])
    expect(execucao.gravados).toHaveLength(4)
    expect(resumo.status).toBe('PARTIAL')
    expect(resumo.falhas).toEqual(['modalidade 6, página 2: HTTP 500'])
  })

  it('400 não é repetido: abandona só aquela modalidade', async () => {
    const { rede, sequencia, esperas } = redeFalsa((modalidade, pagina) =>
      modalidade === 1 ? erroHttp(400) : { itens: contratacoes(modalidade, pagina), totalPaginas: 1 }
    )
    const resumo = await coleta(rede, [1, 6]).executar()
    expect(sequencia()).toEqual(['1:1', '6:1'])
    expect(esperas).toEqual([])
    expect(resumo.status).toBe('PARTIAL')
  })

  it('API fora do ar: número de pedidos é limitado e a execução termina FAILED', async () => {
    const { rede, pedidos } = redeFalsa(() => erroDeRede('ECONNABORTED'))
    const execucao = coleta(rede, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    const resumo = await execucao.executar()
    expect(pedidos.length).toBeLessThanOrEqual(ORCAMENTO_DE_TENTATIVAS_POR_EXECUCAO + 13 * 2)
    expect(resumo.tentativasExtras).toBe(ORCAMENTO_DE_TENTATIVAS_POR_EXECUCAO)
    expect(resumo.interrompida).toBe(true)
    expect(resumo.status).toBe('FAILED')
    expect(resumo.falhas.some((f) => f.includes('não consultada'))).toBe(true)
  })
})

describe('statusDaColeta', () => {
  it('reflete falha real', () => {
    expect(statusDaColeta(10, [])).toBe('SUCCESS')
    expect(statusDaColeta(10, ['modalidade 6, página 2: HTTP 500'])).toBe('PARTIAL')
    expect(statusDaColeta(0, ['modalidade 6, página 1: ECONNABORTED'])).toBe('FAILED')
  })
})
