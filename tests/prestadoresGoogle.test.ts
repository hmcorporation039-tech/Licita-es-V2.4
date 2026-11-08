import { afterEach, describe, expect, it, vi } from 'vitest'
import { buscarPrestadoresNoGoogle, GoogleIndisponivel, GoogleNaoConfigurado, googleConfigurado } from '../src/services/prestadoresGoogle'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', async (original) => {
  const real = (await original<typeof import('axios')>()).default
  return { default: { ...real, post, isAxiosError: real.isAxiosError } }
})

describe('busca de prestadores no Google', () => {
  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY
    post.mockReset()
  })

  it('sem chave, avisa que não está ativada e não chama o Google', async () => {
    expect(googleConfigurado()).toBe(false)
    await expect(buscarPrestadoresNoGoogle({ texto: 'x', centro: { lat: 0, lng: 0 }, raioKm: 10 })).rejects.toBeInstanceOf(GoogleNaoConfigurado)
    expect(post).not.toHaveBeenCalled()
  })

  it('manda a chave no cabeçalho, limita o raio a 50 km e converte os lugares', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'chave-de-teste'
    post.mockResolvedValue({ data: { places: [{ id: 'p1', displayName: { text: 'Elétrica Pará' }, rating: 4.6, userRatingCount: 40, businessStatus: 'OPERATIONAL' }, { foo: 1 }] } })
    const lugares = await buscarPrestadoresNoGoogle({ texto: 'eletricista em Belém PA', centro: { lat: -1.45, lng: -48.49 }, raioKm: 300 })
    expect(lugares).toHaveLength(1)
    expect(lugares[0]).toMatchObject({ id: 'p1', nome: 'Elétrica Pará', nota: 4.6, avaliacoes: 40 })
    const [url, corpo, opcoes] = post.mock.calls[0]
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(corpo).toMatchObject({ textQuery: 'eletricista em Belém PA', languageCode: 'pt-BR', regionCode: 'BR' })
    expect(corpo.locationBias.circle.radius).toBe(50_000)
    expect(opcoes.headers['X-Goog-Api-Key']).toBe('chave-de-teste')
    expect(opcoes.headers['X-Goog-FieldMask']).toContain('places.userRatingCount')
  })

  it('erro do Google vira GoogleIndisponivel só com o status', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'chave-de-teste'
    post.mockRejectedValue(Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 403, data: { error: { message: 'API key chave-de-teste inválida' } } } }))
    const erro = await buscarPrestadoresNoGoogle({ texto: 'x', centro: { lat: 0, lng: 0 }, raioKm: 10 }).catch((e) => e)
    expect(erro).toBeInstanceOf(GoogleIndisponivel)
    expect(erro.message).toBe('O Google respondeu 403.')
  })
})
