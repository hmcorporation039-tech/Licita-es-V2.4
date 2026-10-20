import { beforeEach, describe, expect, it, vi } from 'vitest'

type Linha = Record<string, unknown> & { tenderId: string; numeroItem: number | null }

const banco = vi.hoisted(() => ({ itens: [] as Linha[], licitacoes: new Map<string, Record<string, unknown>>() }))

vi.mock('@prisma/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@prisma/client')>()
  const selecionar = (linha: Linha, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((campo) => [campo, linha[campo] ?? null])) : { ...linha }
  const filtrar = (where: { tenderId: string; numeroItem?: number | { in: number[] } }) =>
    banco.itens.filter((l) => {
      if (l.tenderId !== where.tenderId) return false
      if (where.numeroItem === undefined) return true
      if (typeof where.numeroItem === 'number') return l.numeroItem === where.numeroItem
      return where.numeroItem.in.includes(l.numeroItem as number)
    })
  class PrismaClientEmMemoria {
    tenderItem = {
      findMany: async ({ where, select }: { where: Parameters<typeof filtrar>[0]; select?: Record<string, boolean> }) => filtrar(where).map((l) => selecionar(l, select)),
      count: async ({ where }: { where: Parameters<typeof filtrar>[0] }) => filtrar(where).length,
      createMany: async ({ data }: { data: Linha[] }) => {
        banco.itens.push(...data.map((d) => ({ ...d })))
        return { count: data.length }
      },
      updateMany: async ({ where, data }: { where: Parameters<typeof filtrar>[0]; data: Record<string, unknown> }) => {
        const alvos = filtrar(where)
        for (const alvo of alvos) Object.assign(alvo, data)
        return { count: alvos.length }
      },
    }
    tender = {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const atual = { ...(banco.licitacoes.get(where.id) ?? {}), ...data }
        banco.licitacoes.set(where.id, atual)
        return atual
      },
      updateMany: async ({ where, data }: { where: { id: string; valorHomologado?: null }; data: Record<string, unknown> }) => {
        const atual = banco.licitacoes.get(where.id) ?? {}
        if (where.valorHomologado === null && atual.valorHomologado != null) return { count: 0 }
        banco.licitacoes.set(where.id, { ...atual, ...data })
        return { count: 1 }
      },
    }
  }
  return { ...original, PrismaClient: PrismaClientEmMemoria }
})

const COMPRA = { cnpj: '14136816000151', ano: 2026, sequencial: 14 }
const CAMINHO = '/v1/orgaos/14136816000151/compras/2026/14/itens'

const LISTA_DO_PNCP = [
  {
    numeroItem: 1,
    descricao: 'CAFÉ TORRADO E MOÍDO',
    informacaoComplementar: 'Pacote de 500 g, tipo tradicional',
    criterioJulgamentoNome: 'Menor preço',
    materialOuServico: 'M',
    catalogoCodigoItem: '461245',
    unidadeMedida: 'Pacote',
    quantidade: 600,
    valorUnitarioEstimado: 2.5,
    valorTotal: 1500,
    temResultado: true,
    situacaoCompraItem: 2,
    situacaoCompraItemNome: 'Homologado',
  },
  {
    numeroItem: 2,
    descricao: 'Serviço de entrega',
    informacaoComplementar: null,
    criterioJulgamentoNome: 'Menor preço',
    materialOuServico: 'S',
    catalogoCodigoItem: '27502',
    unidadeMedida: 'Serviço',
    quantidade: 1,
    valorUnitarioEstimado: 300,
    valorTotal: 300,
    temResultado: false,
    situacaoCompraItem: 4,
    situacaoCompraItemNome: 'Deserto',
  },
]

const RESULTADO = {
  niFornecedor: '52112156000168',
  nomeRazaoSocialFornecedor: 'MERCEARIA SO MERENDAS LTDA',
  porteFornecedorNome: 'ME',
  valorUnitarioHomologado: 1.99,
  quantidadeHomologada: 600,
  valorTotalHomologado: 1194,
  ordemClassificacaoSrp: 1,
  sequencialResultado: 1,
  dataResultado: '2026-10-16',
  dataCancelamento: '0001-01-01T00:00:00',
  situacaoCompraItemResultadoId: 1,
  situacaoCompraItemResultadoNome: 'Informado',
}

function pncpFalso() {
  const chamadas: string[] = []
  const buscar = async <T>(caminho: string, parametros?: Record<string, number>) => {
    chamadas.push(parametros?.pagina ? `${caminho}?pagina=${parametros.pagina}` : caminho)
    if (caminho === CAMINHO) return (parametros?.pagina === 1 ? LISTA_DO_PNCP : []) as T[]
    if (caminho === `${CAMINHO}/1/resultados`) return [RESULTADO] as T[]
    return [] as T[]
  }
  return { buscar, chamadas }
}

describe('licitação acompanhada sem itens no banco', () => {
  beforeEach(() => {
    banco.itens.length = 0
    banco.licitacoes.clear()
  })

  it('ganha os itens pela lista paginada do PNCP, com a mesma normalização da coleta, e o vencedor', async () => {
    const { OrcamentoDeRequisicoes, conferirResultadoDaLicitacao } = await import('../src/services/resultadoDasLicitacoes')
    const { buscar, chamadas } = pncpFalso()
    const conferencia = await conferirResultadoDaLicitacao(
      { id: 'licitacao-sem-itens', situacao: 'ENCERRADA', valorHomologado: null, compra: COMPRA },
      new OrcamentoDeRequisicoes(10),
      buscar,
      new Date('2026-10-20T12:00:00Z')
    )

    expect(conferencia).toEqual({ completa: true, itensCriados: 2, vencedores: 1, finalizada: true })
    expect(chamadas).toEqual([`${CAMINHO}?pagina=1`, `${CAMINHO}/1/resultados`])
    expect(banco.itens).toHaveLength(2)

    const [cafe, entrega] = banco.itens
    expect(cafe).toMatchObject({
      tenderId: 'licitacao-sem-itens',
      numeroItem: 1,
      descricao: 'CAFÉ TORRADO E MOÍDO',
      descricaoNorm: 'cafe torrado e moido',
      descricaoDetalhada: 'Pacote de 500 g, tipo tradicional',
      criterioJulgamento: 'Menor preço',
      catmatCode: '461245',
      catserCode: undefined,
      unidadeMedida: 'Pacote',
      quantidade: 600,
      valorUnitario: 2.5,
      valorTotal: 1500,
      situacaoDoResultado: 'Homologado',
      vencedorNi: '52112156000168',
      vencedorNome: 'MERCEARIA SO MERENDAS LTDA',
      vencedorPorte: 'ME',
      valorUnitarioHomologado: 1.99,
      valorTotalHomologado: 1194,
      fornecedoresRegistrados: 1,
    })
    expect(entrega).toMatchObject({ numeroItem: 2, catmatCode: undefined, catserCode: '27502', descricaoDetalhada: undefined, situacaoDoResultado: 'Deserto' })
    expect(entrega.vencedorNome).toBeUndefined()

    expect(banco.licitacoes.get('licitacao-sem-itens')).toMatchObject({ resultadoFinal: true, situacao: 'HOMOLOGADA', valorHomologado: 1194 })
  })

  it('a mesma normalização da coleta: o mapeamento é o de fetchPNCPItens', async () => {
    const { normalizarItemDoPncp } = await import('../src/services/pncpItemsService')
    const { saveTenderItemsQueFaltam } = await import('../src/services/tenderService')
    await saveTenderItemsQueFaltam('outra', LISTA_DO_PNCP.map((i) => normalizarItemDoPncp(i)))
    expect(banco.itens.map((i) => i.descricaoNorm)).toEqual(['cafe torrado e moido', 'servico de entrega'])
  })

  it('não duplica: a segunda conferência e a gravação sob demanda da coleta não criam de novo', async () => {
    const { OrcamentoDeRequisicoes, conferirResultadoDaLicitacao } = await import('../src/services/resultadoDasLicitacoes')
    const { saveTenderItemsIfMissing, saveTenderItemsQueFaltam } = await import('../src/services/tenderService')
    const { normalizarItemDoPncp } = await import('../src/services/pncpItemsService')
    const licitacao = { id: 'licitacao-sem-itens', situacao: 'ENCERRADA' as const, valorHomologado: null, compra: COMPRA }

    await conferirResultadoDaLicitacao(licitacao, new OrcamentoDeRequisicoes(10), pncpFalso().buscar)
    const segunda = await conferirResultadoDaLicitacao(licitacao, new OrcamentoDeRequisicoes(10), pncpFalso().buscar)
    expect(segunda.itensCriados).toBe(0)
    expect(segunda.vencedores).toBe(0)

    await saveTenderItemsIfMissing(licitacao.id, LISTA_DO_PNCP.map((i) => normalizarItemDoPncp(i)))
    expect(await saveTenderItemsQueFaltam(licitacao.id, LISTA_DO_PNCP.map((i) => normalizarItemDoPncp(i)))).toBe(0)
    expect(banco.itens).toHaveLength(2)
    expect(banco.itens[0].vencedorNome).toBe('MERCEARIA SO MERENDAS LTDA')
  })

  it('só cria o que falta quando a coleta sob demanda gravou parte dos itens', async () => {
    const { saveTenderItemsQueFaltam } = await import('../src/services/tenderService')
    const { normalizarItemDoPncp } = await import('../src/services/pncpItemsService')
    banco.itens.push({ tenderId: 'parcial', numeroItem: 1, descricao: 'já gravado', vencedorNome: 'QUEM VENCEU' })
    expect(await saveTenderItemsQueFaltam('parcial', LISTA_DO_PNCP.map((i) => normalizarItemDoPncp(i)))).toBe(1)
    expect(banco.itens.filter((i) => i.tenderId === 'parcial').map((i) => [i.numeroItem, i.descricao, i.vencedorNome ?? null])).toEqual([
      [1, 'já gravado', 'QUEM VENCEU'],
      [2, 'Serviço de entrega', null],
    ])
  })
})
