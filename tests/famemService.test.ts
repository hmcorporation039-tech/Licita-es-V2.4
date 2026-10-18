import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../src/lib/httpClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/httpClient')>()
  return { ...original, famemClientOriginal: original.famemClient, famemClient: { get: http.get } }
})

import * as clientes from '../src/lib/httpClient'
import { SessaoDaFamemAusente, abrirSessaoDaFamem, baixarListaDaFamem, baixarPublicacaoDaFamem, cookieDaSessao } from '../src/services/famemService'

beforeEach(() => {
  http.get.mockReset()
})

describe('cookie da sessão da FAMEM', () => {
  it('pega só o ci_session do Set-Cookie', () => {
    expect(cookieDaSessao(['ci_session=dhfbts69pephr8ko4gk81ov9jcpbs3b2; expires=Sun, 18-Oct-2026 20:44:23 GMT; Max-Age=1800; path=/; HttpOnly'])).toBe(
      'ci_session=dhfbts69pephr8ko4gk81ov9jcpbs3b2'
    )
    expect(cookieDaSessao('outro=1; path=/')).toBeNull()
    expect(cookieDaSessao(undefined)).toBeNull()
  })

  it('recusa valor com caractere que poderia quebrar o cabeçalho', () => {
    expect(cookieDaSessao(['ci_session=abc\r\nX-Injetado: 1; path=/'])).toBeNull()
    expect(cookieDaSessao(['ci_session=; path=/'])).toBeNull()
  })
})

describe('requisições à FAMEM', () => {
  it('abre a sessão na página de publicações', async () => {
    http.get.mockResolvedValue({ data: '<html></html>', headers: { 'set-cookie': ['ci_session=abc123def456; path=/; HttpOnly'] } })
    await expect(abrirSessaoDaFamem()).resolves.toBe('ci_session=abc123def456')
    expect(http.get.mock.calls[0][0]).toBe('/dom/dom/todasPublicacoes')
  })

  it('sem o cookie, a sessão falha com erro próprio', async () => {
    http.get.mockResolvedValue({ data: '<html></html>', headers: {} })
    await expect(abrirSessaoDaFamem()).rejects.toBeInstanceOf(SessaoDaFamemAusente)
  })

  it('pede a lista com o cookie da sessão, como o DataTables do site', async () => {
    http.get.mockResolvedValue({ data: '{"data":[]}', headers: {} })
    await expect(baixarListaDaFamem('ci_session=abc123def456')).resolves.toBe('{"data":[]}')
    const [caminho, config] = http.get.mock.calls[0]
    expect(caminho).toBe('/dom/dom/pesquisaPublicacoes/')
    expect(config.headers).toMatchObject({ Cookie: 'ci_session=abc123def456', 'X-Requested-With': 'XMLHttpRequest' })
  })

  it('só pede publicação com identificador numérico', async () => {
    http.get.mockResolvedValue({ data: '<html></html>', headers: {} })
    await baixarPublicacaoDaFamem('713794')
    expect(http.get.mock.calls[0][0]).toBe('/dom/dom/publicacoesDetalhes/713794')
    await expect(baixarPublicacaoDaFamem('../admin')).rejects.toThrow(/inválido/)
    expect(http.get).toHaveBeenCalledTimes(1)
  })
})

describe('cliente HTTP da FAMEM', () => {
  it('429 volta na hora para o coletor parar, sem as novas tentativas automáticas do cliente', async () => {
    const original = (clientes as unknown as { famemClientOriginal: typeof clientes.famemClient }).famemClientOriginal
    let chamadas = 0
    const adapter = async (config: InternalAxiosRequestConfig) => {
      chamadas++
      throw new AxiosError('Too Many Requests', 'ERR_BAD_REQUEST', config, null, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        config,
        data: '',
      })
    }
    await expect(original.get('/dom/dom/todasPublicacoes', { adapter, headers: new AxiosHeaders() })).rejects.toMatchObject({ response: { status: 429 } })
    expect(chamadas).toBe(1)
    expect(original.defaults.maxRedirects).toBe(0)
    expect(original.defaults.maxContentLength).toBe(5 * 1024 * 1024)
  })
})
