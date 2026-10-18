import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RedeDoTceCe } from '../../src/services/tceCeColeta'
import { LinhaFalsa, listaFalsa, paginaDoTceCe } from '../helpers/tceCe'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const FORTALEZA: LinhaFalsa = { idProcesso: 275372, idLicitacao: 190360, numero: 'CEI 90/26SEINF', municipio: 'FORTALEZA', objeto: 'CONTRATAÇÃO INTEGRADA DO VIADUTO', publicado: '01/10/2026', abertura: '30/12/2026', valor: '51.848.927,67' }
const IRAUCUBA: LinhaFalsa = { idProcesso: 275133, idLicitacao: 190245, numero: '2026.08.12.01PE', municipio: 'IRAUCUBA', objeto: 'Aquisição de Itens para laboratório', publicado: '25/09/2026', abertura: '09/10/2026', reabertura: '27/10/2026', valor: '484.431,98' }
const TABULEIRO: LinhaFalsa = { idProcesso: 275813, idLicitacao: 190595, numero: 'P.E 006 2026 DI', municipio: 'TABULEIRO DO NORTE', objeto: 'AQUISIÇÃO DE ÁGUA E VASILHAMES', publicado: '16/10/2026', abertura: '03/11/2026', valor: '72.947,84' }

rodar('TCE-CE — coleta gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorTceCe')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-17T15:00:00Z')
  const limites = { maxPaginas: 10, maxDetalhes: 20, paginasSemCandidataParaParar: 5 }
  const detalhesPedidos: number[] = []

  function rede(linhas: LinhaFalsa[], detalhes: Record<number, string> = {}): RedeDoTceCe {
    return {
      baixarLista: async (pagina) => listaFalsa(pagina === 1 ? linhas : [], 2),
      baixarDetalhe: async ({ idLicitacao }) => {
        detalhesPedidos.push(idLicitacao)
        return detalhes[idLicitacao] ?? paginaDoTceCe(`detalhe-${idLicitacao}.html`)
      },
      esperar: async () => undefined,
    }
  }

  const doBanco = (id: number) => tenders.prisma.tender.findUnique({ where: { fonteId: `TCE-CE-${id}` } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    coletor = await import('../../src/workers/coletorTceCe')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await tenders.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'TCE_CE' }, { fonteId: 'pncp-tce-ce-teste' }] } })
    await tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: 'pncp-tce-ce-teste',
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: 'Aquisição de água mineral e vasilhames para as unidades administrativas da Prefeitura de Tabuleiro do Norte',
        objetoNorm: 'aquisicao de agua mineral e vasilhames para as unidades administrativas da prefeitura de tabuleiro do norte',
        uf: 'CE',
        municipio: 'Tabuleiro do Norte',
        municipioNorm: 'tabuleiro do norte',
        municipioIbge: '2313104',
        aberturaAt: new Date('2026-10-17T11:00:00Z'),
        encerramentoAt: new Date('2026-11-03T12:30:00Z'),
        publicadoAt: new Date('2026-10-16T13:00:00Z'),
        rawJson: { numeroCompra: '006', processo: 'P.E 006 2026 DI' },
      },
    })
  }, 60_000)

  afterAll(async () => {
    await tenders?.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'TCE_CE' }, { fonteId: 'pncp-tce-ce-teste' }] } })
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava as abertas fora do PNCP, descarta a que o PNCP já trouxe e conta como aberta até a sessão', async () => {
    const resumo = await coletor.coletarDoTceCe(rede([FORTALEZA, IRAUCUBA, TABULEIRO]), agora, limites)

    expect(resumo).toMatchObject({ paginas: 2, listaCompleta: true, comSessaoFutura: 3, municipios: 3, totalNew: 2, novasForaDoPncp: 2 })
    expect(resumo.duplicadasPncpPorObjeto + resumo.duplicadasPncpPorNumero).toBe(1)
    expect(detalhesPedidos).toEqual([190245, 190360])
    expect(await doBanco(190595)).toBeNull()

    const fortaleza = await doBanco(190360)
    expect(fortaleza).toMatchObject({
      fonte: 'TCE_CE',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      uf: 'CE',
      municipio: 'Fortaleza',
      municipioNorm: 'fortaleza',
      municipioIbge: '2304400',
      orgao: 'Prefeitura Municipal de Fortaleza',
      numeroControle: 'CEI 90/26SEINF',
      linkEdital: 'https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/detalhes/proc/275372/licit/190360',
    })
    expect(Number(fortaleza?.valorEstimado)).toBe(51848927.67)
    expect(fortaleza?.aberturaAt?.toISOString()).toBe('2026-12-30T13:00:00.000Z')
    expect(fortaleza?.encerramentoAt).toBeNull()
    expect((await doBanco(190245))?.aberturaAt?.toISOString()).toBe('2026-10-27T12:00:00.000Z')

    const contadas = await tenders.prisma.tender.findMany({
      where: { fonte: 'TCE_CE', ...abertas.whereLicitacaoAberta(agora) },
      select: { fonteId: true },
      orderBy: { fonteId: 'asc' },
    })
    expect(contadas.map((t) => t.fonteId)).toEqual(['TCE-CE-190245', 'TCE-CE-190360'])
    expect(abertas.estaAberta(fortaleza!, agora)).toBe(true)
    expect(abertas.estaAberta(fortaleza!, new Date('2026-12-31T12:00:00Z'))).toBe(false)
  })

  it('na coleta seguinte, sem mudança na lista, não relê nada', async () => {
    const pedidosAntes = detalhesPedidos.length
    const resumo = await coletor.coletarDoTceCe(rede([FORTALEZA, IRAUCUBA, TABULEIRO]), agora, limites)
    expect(detalhesPedidos.slice(pedidosAntes)).toEqual([])
    expect(resumo.totalNew).toBe(0)
    expect(resumo.revisitadas).toBe(0)
  })

  it('reabertura nova atualiza a data; a que sumiu da lista e foi cancelada sai das abertas', async () => {
    const reaberta = paginaDoTceCe('detalhe-190245.html').replace('<strong>Data da Reabertura: </strong>27/10/2026', '<strong>Data da Reabertura: </strong>05/11/2026')
    const cancelada = paginaDoTceCe('detalhe-190360.html').replace('</strong>Aberta', '</strong>Cancelada')
    const resumo = await coletor.coletarDoTceCe(rede([{ ...IRAUCUBA, reabertura: '05/11/2026' }, TABULEIRO], { 190245: reaberta, 190360: cancelada }), agora, limites)

    expect(resumo).toMatchObject({ revisitadas: 1, sumidas: 1, situacoesAlteradas: 1, totalUpdated: 1 })
    expect((await doBanco(190245))?.aberturaAt?.toISOString()).toBe('2026-11-05T12:00:00.000Z')
    const fortaleza = await doBanco(190360)
    expect(fortaleza?.situacao).toBe('CANCELADA')
    expect(fortaleza?.situacaoCheckedAt).toEqual(agora)
    expect(((await doBanco(190245))?.rawJson as { assinaturaDaLista?: string }).assinaturaDaLista).toContain('05/11/2026')

    const contadas = await tenders.prisma.tender.count({ where: { fonte: 'TCE_CE', ...abertas.whereLicitacaoAberta(agora) } })
    expect(contadas).toBe(1)
  })
})
