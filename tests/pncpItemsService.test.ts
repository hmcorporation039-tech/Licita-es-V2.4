import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPNCPItens } from '../src/services/pncpItemsService'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('axios', async (original) => {
  const real = (await original<typeof import('axios')>()).default
  return { default: { ...real, get, isAxiosError: real.isAxiosError } }
})

const item = (numeroItem: number) => ({
  numeroItem,
  descricao: `Item ${numeroItem}`,
  informacaoComplementar: null,
  criterioJulgamentoNome: null,
  materialOuServico: 'M',
  quantidade: 1,
  unidadeMedida: 'UN',
  valorUnitarioEstimado: 10,
  valorTotal: 10,
  catalogoCodigoItem: null,
})

describe('fetchPNCPItens', () => {
  afterEach(() => get.mockReset())

  it('pagina o /itens e junta as páginas até uma vir incompleta', async () => {
    const pagina1 = Array.from({ length: 500 }, (_, i) => item(i + 1))
    const pagina2 = Array.from({ length: 30 }, (_, i) => item(501 + i))
    get.mockResolvedValueOnce({ data: pagina1 }).mockResolvedValueOnce({ data: pagina2 })

    const itens = await fetchPNCPItens('12075748000132', 2025, 126)

    expect(itens).toHaveLength(530)
    expect(itens[0]).toMatchObject({ numeroItem: 1, descricao: 'Item 1', valorUnitario: 10 })
    expect(itens[529].numeroItem).toBe(530)
    expect(get).toHaveBeenCalledTimes(2)
    const [url, opcoes1] = get.mock.calls[0]
    expect(url).toBe('https://pncp.gov.br/api/pncp/v1/orgaos/12075748000132/compras/2025/126/itens')
    expect(opcoes1.params).toEqual({ pagina: 1, tamanhoPagina: 500 })
    expect(get.mock.calls[1][1].params).toEqual({ pagina: 2, tamanhoPagina: 500 })
  })

  it('para na primeira página quando ela vem com menos de 500 itens', async () => {
    get.mockResolvedValueOnce({ data: [item(1), item(2)] })
    const itens = await fetchPNCPItens('12075748000132', 2025, 126)
    expect(itens).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
