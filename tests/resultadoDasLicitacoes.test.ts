import { afterEach, describe, expect, it, vi } from 'vitest'
import { pncpClient } from '../src/lib/httpClient'
import {
  BuscarListaNoPncp,
  ITENS_POR_PAGINA,
  OrcamentoDeRequisicoes,
  TETO_PADRAO_DE_REQUISICOES,
  TetoDeRequisicoesAtingido,
  buscarListaNoPncp,
  buscarVencedorDoItem,
  lerItensDaCompra,
  tetoDeRequisicoes,
} from '../src/services/resultadoDasLicitacoes'

const COMPRA = { cnpj: '14136816000151', ano: 2026, sequencial: 14 }

function itens(de: number, ate: number) {
  return Array.from({ length: ate - de + 1 }, (_, i) => ({ numeroItem: de + i, temResultado: true, situacaoCompraItem: 2, situacaoCompraItemNome: 'Homologado' }))
}

function pncpFalso(paginas: unknown[][]) {
  const chamadas: { caminho: string; parametros?: Record<string, number> }[] = []
  const buscar: BuscarListaNoPncp = async <T>(caminho: string, parametros?: Record<string, number>) => {
    chamadas.push({ caminho, parametros })
    const pagina = parametros?.pagina ?? 1
    return (paginas[pagina - 1] ?? []) as T[]
  }
  return { buscar, chamadas }
}

describe('leitura paginada dos itens da compra', () => {
  it('pagina de 50 em 50 até a página incompleta', async () => {
    const { buscar, chamadas } = pncpFalso([itens(1, 50), itens(51, 81)])
    const orcamento = new OrcamentoDeRequisicoes(10)
    const lidos = await lerItensDaCompra(COMPRA, orcamento, buscar)
    expect(lidos.completo).toBe(true)
    expect(lidos.itens.map((i) => i.numeroItem)).toEqual(itens(1, 81).map((i) => i.numeroItem))
    expect(chamadas).toEqual([
      { caminho: '/v1/orgaos/14136816000151/compras/2026/14/itens', parametros: { pagina: 1, tamanhoPagina: ITENS_POR_PAGINA } },
      { caminho: '/v1/orgaos/14136816000151/compras/2026/14/itens', parametros: { pagina: 2, tamanhoPagina: ITENS_POR_PAGINA } },
    ])
    expect(orcamento.usadas).toBe(2)
  })

  it('exatamente 50 itens: a página seguinte vazia encerra', async () => {
    const { buscar, chamadas } = pncpFalso([itens(1, 50), []])
    const lidos = await lerItensDaCompra(COMPRA, new OrcamentoDeRequisicoes(10), buscar)
    expect(lidos).toMatchObject({ completo: true })
    expect(lidos.itens).toHaveLength(50)
    expect(chamadas).toHaveLength(2)
  })

  it('servidor que ignora a página e repete os mesmos itens não vira laço', async () => {
    const mesmos = itens(1, 50)
    const chamadas: number[] = []
    const buscar: BuscarListaNoPncp = async <T>(_caminho: string, parametros?: Record<string, number>) => {
      chamadas.push(parametros?.pagina ?? 0)
      return mesmos as T[]
    }
    const lidos = await lerItensDaCompra(COMPRA, new OrcamentoDeRequisicoes(100), buscar)
    expect(lidos.completo).toBe(true)
    expect(chamadas).toEqual([1, 2])
  })

  it('para no teto de requisições sem passar dele e avisa que ficou incompleto', async () => {
    const { buscar, chamadas } = pncpFalso([itens(1, 50), itens(51, 100), itens(101, 150), itens(151, 160)])
    const orcamento = new OrcamentoDeRequisicoes(2)
    const lidos = await lerItensDaCompra(COMPRA, orcamento, buscar)
    expect(lidos.completo).toBe(false)
    expect(lidos.itens).toHaveLength(100)
    expect(chamadas).toHaveLength(2)
    expect(orcamento.usadas).toBe(2)
    expect(orcamento.esgotado).toBe(true)
  })

  it('identificador inválido não chega ao PNCP', async () => {
    const { buscar, chamadas } = pncpFalso([])
    await expect(lerItensDaCompra({ cnpj: '../../x', ano: 2026, sequencial: 1 }, new OrcamentoDeRequisicoes(5), buscar)).rejects.toThrow('inválido')
    expect(chamadas).toHaveLength(0)
  })
})

describe('orçamento de requisições', () => {
  it('recusa a requisição que passaria do teto', async () => {
    const orcamento = new OrcamentoDeRequisicoes(1)
    await orcamento.gastar(async () => 1)
    await expect(orcamento.gastar(async () => 2)).rejects.toBeInstanceOf(TetoDeRequisicoesAtingido)
    expect(orcamento.usadas).toBe(1)
  })

  it('teto vem do ambiente e cai no padrão quando inválido', () => {
    expect(tetoDeRequisicoes('120')).toBe(120)
    expect(tetoDeRequisicoes(undefined)).toBe(TETO_PADRAO_DE_REQUISICOES)
    expect(tetoDeRequisicoes('0')).toBe(TETO_PADRAO_DE_REQUISICOES)
    expect(tetoDeRequisicoes('abc')).toBe(TETO_PADRAO_DE_REQUISICOES)
    expect(TETO_PADRAO_DE_REQUISICOES).toBe(600)
  })
})

describe('resultado de um item', () => {
  afterEach(() => vi.restoreAllMocks())

  it('busca /resultados do item e devolve o vencedor', async () => {
    const { buscar, chamadas } = pncpFalso([
      [
        { niFornecedor: '52112156000168', nomeRazaoSocialFornecedor: 'MERCEARIA SO MERENDAS LTDA', valorUnitarioHomologado: 1.99, ordemClassificacaoSrp: 1, dataCancelamento: '0001-01-01T00:00:00', situacaoCompraItemResultadoNome: 'Informado' },
      ],
    ])
    const vencedor = await buscarVencedorDoItem(COMPRA, 1, buscar)
    expect(chamadas[0].caminho).toBe('/v1/orgaos/14136816000151/compras/2026/14/itens/1/resultados')
    expect(vencedor?.nome).toBe('MERCEARIA SO MERENDAS LTDA')
  })

  it('404 do PNCP é lista vazia, não erro', async () => {
    vi.spyOn(pncpClient, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 404 }, message: 'Not Found' })
    await expect(buscarListaNoPncp('/v1/orgaos/14136816000151/compras/2026/14/itens/9/resultados')).resolves.toEqual([])
  })

  it('resposta sem lista (204 vazio) também é lista vazia', async () => {
    vi.spyOn(pncpClient, 'get').mockResolvedValue({ data: '', status: 204 })
    await expect(buscarListaNoPncp('/v1/orgaos/14136816000151/compras/2026/14/itens')).resolves.toEqual([])
  })

  it('consulta a API de compras do PNCP pelo cliente com limite de taxa', async () => {
    const get = vi.spyOn(pncpClient, 'get').mockResolvedValue({ data: [{ numeroItem: 1 }], status: 200 })
    await buscarListaNoPncp('/v1/orgaos/14136816000151/compras/2026/14/itens', { pagina: 1, tamanhoPagina: 50 })
    expect(get).toHaveBeenCalledWith('/v1/orgaos/14136816000151/compras/2026/14/itens', {
      baseURL: 'https://pncp.gov.br/api/pncp',
      params: { pagina: 1, tamanhoPagina: 50 },
    })
  })

  it('outros erros sobem para quem chamou', async () => {
    vi.spyOn(pncpClient, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 500 }, message: 'Erro' })
    await expect(buscarListaNoPncp('/v1/x')).rejects.toMatchObject({ response: { status: 500 } })
  })
})
