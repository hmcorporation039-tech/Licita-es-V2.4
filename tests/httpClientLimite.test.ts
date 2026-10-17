import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter } from 'axios'
import { LimiteDeRequisicoesExcedido, createRateLimitedClient, ehPaginaDeLimiteDeRequisicoes } from '../src/lib/httpClient'

const PAGINA_DE_LIMITE = '<html><body><h1>Limite de requisições excedido</h1></body></html>'

function adaptador(corpos: string[]) {
  const chamadas: string[] = []
  const adapter: AxiosAdapter = async (config) => {
    const corpo = corpos[Math.min(chamadas.length, corpos.length - 1)]
    chamadas.push(String(config.url))
    return { data: corpo, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  return { adapter, chamadas }
}

describe('página HTML de limite de requisições', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reconhece a página com ou sem acento', () => {
    expect(ehPaginaDeLimiteDeRequisicoes(PAGINA_DE_LIMITE)).toBe(true)
    expect(ehPaginaDeLimiteDeRequisicoes('<p>Limite de requisicoes excedido</p>')).toBe(true)
    expect(ehPaginaDeLimiteDeRequisicoes('{"data":[]}')).toBe(false)
    expect(ehPaginaDeLimiteDeRequisicoes({ data: [] })).toBe(false)
  })

  it('HTTP 200 com a página de limite: espera e repete até vir o JSON', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { adapter, chamadas } = adaptador([PAGINA_DE_LIMITE, '{"data":[{"id":1}],"totalPaginas":1}'])
    const client = createRateLimitedClient('', 0, undefined, { detectarPaginaDeLimite: true })

    const promessa = client.get('/v1/contratacoes/proposta', { adapter })
    await vi.advanceTimersByTimeAsync(10_000)
    const resposta = await promessa

    expect(chamadas).toHaveLength(2)
    expect(resposta.data).toEqual({ data: [{ id: 1 }], totalPaginas: 1 })
  })

  it('desiste depois das tentativas e rejeita com LimiteDeRequisicoesExcedido', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { adapter, chamadas } = adaptador([PAGINA_DE_LIMITE])
    const client = createRateLimitedClient('', 0, undefined, { detectarPaginaDeLimite: true })

    const promessa = client.get('/v1/contratacoes/proposta', { adapter }).catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(70_000)

    expect(await promessa).toBeInstanceOf(LimiteDeRequisicoesExcedido)
    expect(chamadas).toHaveLength(4)
  })

  it('cliente sem a detecção devolve o HTML como antes', async () => {
    const { adapter, chamadas } = adaptador([PAGINA_DE_LIMITE])
    const client = createRateLimitedClient('', 0)
    const resposta = await client.get('/qualquer', { adapter })
    expect(resposta.data).toBe(PAGINA_DE_LIMITE)
    expect(chamadas).toHaveLength(1)
  })
})
