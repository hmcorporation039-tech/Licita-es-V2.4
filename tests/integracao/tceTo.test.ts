import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RedeDoTceTo } from '../../src/services/tceToColeta'
import type { MemoriaDeDiarios } from '../../src/services/queridoDiarioColeta'
import { arquivoDoTceTo, itemReal, listaJson } from '../helpers/tceTo'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const TAGUATINGA = 829301
const TOCANTINIA = 829304
const AUGUSTINOPOLIS = 828771

rodar('TCE-TO — coleta gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorTceTo')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let entreFontes: typeof import('../../src/services/duplicataEntreFontes')
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-18T15:00:00Z')
  const limites = { porPagina: 200, maxPaginas: 5, maxDetalhes: 20, orcamentoMs: 60_000 }
  const detalhesPedidos: number[] = []
  const lidos = new Set<string>()
  const memoria: MemoriaDeDiarios = {
    jaLidos: async (chaves) => new Set(chaves.filter((c) => lidos.has(c))),
    marcarLido: async (chave) => {
      lidos.add(chave)
    },
  }

  function rede(ids: number[]): RedeDoTceTo {
    return {
      baixarLista: async (pagina) => listaJson(pagina === 1 ? ids.map(itemReal) : [], ids.length),
      baixarDetalhe: async (id) => {
        detalhesPedidos.push(id)
        return arquivoDoTceTo(`detalhe-${id}.json`)
      },
      esperar: async () => undefined,
    }
  }

  const doBanco = (id: number) => tenders.prisma.tender.findUnique({ where: { fonteId: `TCE-TO-${id}` } })
  const limpar = () => tenders.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'TCE_TO' }, { fonteId: { startsWith: 'pncp-tce-to-teste' } }] } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    entreFontes = await import('../../src/services/duplicataEntreFontes')
    coletor = await import('../../src/workers/coletorTceTo')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await limpar()
    await tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: 'pncp-tce-to-teste-taguatinga',
        modalidade: 'CONCORRENCIA',
        situacao: 'ABERTA',
        objeto: 'Registro de preços para futura e eventual contratação de empresa para execução de obra comum de engenharia na implantação, substituição, modernização e eficientização do sistema de iluminação LED de ruas, avenidas e praças do município de Taguatinga-TO',
        objetoNorm:
          'registro de precos para futura e eventual contratacao de empresa para execucao de obra comum de engenharia na implantacao, substituicao, modernizacao e eficientizacao do sistema de iluminacao led de ruas, avenidas e pracas do municipio de taguatinga-to',
        uf: 'TO',
        municipio: 'Taguatinga',
        municipioNorm: 'taguatinga',
        municipioIbge: '1720903',
        orgao: 'MUNICIPIO DE TAGUATINGA',
        aberturaAt: new Date('2026-10-15T12:00:00Z'),
        encerramentoAt: new Date('2026-10-30T12:00:00Z'),
        publicadoAt: new Date('2026-10-15T12:00:00Z'),
        rawJson: { numeroCompra: '4', anoCompra: '2026', processo: '975/2026' },
      },
    })
  }, 60_000)

  afterAll(async () => {
    await limpar()
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava as municipais fora do PNCP, descarta a que o PNCP já trouxe e conta como aberta até o dia da sessão', async () => {
    const resumo = await coletor.coletarDoTceTo(rede([TAGUATINGA, TOCANTINIA, AUGUSTINOPOLIS]), agora, limites, memoria)

    expect(resumo).toMatchObject({ paginas: 1, listaCompleta: true, comSessaoFutura: 3, municipios: 3, totalNew: 2, novasForaDoPncp: 2, municipiosDasNovas: 2 })
    expect(resumo.duplicadasPncpPorObjeto + resumo.duplicadasPncpPorNumero).toBe(1)
    expect(detalhesPedidos).toEqual([AUGUSTINOPOLIS, TOCANTINIA])
    expect(await doBanco(TAGUATINGA)).toBeNull()

    const tocantinia = await doBanco(TOCANTINIA)
    expect(tocantinia).toMatchObject({
      fonte: 'TCE_TO',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'TO',
      municipio: 'Tocantínia',
      municipioNorm: 'tocantinia',
      municipioIbge: '1721109',
      orgao: 'Prefeitura Municipal de Tocantínia',
      numeroControle: '6/2026',
      linkEdital: 'https://app.tceto.tc.br/lo_publico/pesquisar/detalhes?idProcedimento=829304',
    })
    expect(Number(tocantinia?.valorEstimado)).toBe(124933.33)
    expect(tocantinia?.aberturaAt?.toISOString()).toBe('2026-10-29T03:00:00.000Z')
    expect(tocantinia?.encerramentoAt).toBeNull()
    expect(JSON.stringify(tocantinia?.rawJson)).not.toMatch(/"cpf"|assinaturas|responsavel/i)

    const contadas = await tenders.prisma.tender.findMany({
      where: { fonte: 'TCE_TO', ...abertas.whereLicitacaoAberta(agora) },
      select: { fonteId: true },
      orderBy: { fonteId: 'asc' },
    })
    expect(contadas.map((t) => t.fonteId)).toEqual([`TCE-TO-${AUGUSTINOPOLIS}`, `TCE-TO-${TOCANTINIA}`])
    expect(abertas.estaAberta(tocantinia!, new Date('2026-10-29T22:00:00Z'))).toBe(true)
    expect(abertas.estaAberta(tocantinia!, new Date('2026-10-30T12:00:00Z'))).toBe(false)
  })

  it('na coleta seguinte, sem mudança na lista, não relê nada', async () => {
    const antes = detalhesPedidos.length
    const resumo = await coletor.coletarDoTceTo(rede([TAGUATINGA, TOCANTINIA, AUGUSTINOPOLIS]), agora, limites, memoria)
    expect(detalhesPedidos.slice(antes)).toEqual([])
    expect(resumo).toMatchObject({ totalNew: 0, revisitadas: 0 })
  })

  it('quando o PNCP traz a mesma licitação depois, a do TCE-TO some das abertas', async () => {
    const objeto = 'Futura e eventual contratação de serviços de hospedagem destinados ao atendimento das necessidades da Prefeitura Municipal de Tocantínia - TO'
    const pncp = {
      fonte: 'PNCP' as const,
      fonteId: 'pncp-tce-to-teste-tocantinia',
      modalidade: 'PREGAO_ELETRONICO' as const,
      situacao: 'ABERTA' as const,
      objeto,
      uf: 'TO',
      municipio: 'Tocantínia',
      municipioIbge: '1721109',
      orgao: 'MUNICIPIO DE TOCANTINIA',
      aberturaAt: new Date('2026-10-19T12:00:00Z'),
      encerramentoAt: new Date('2026-10-29T12:00:00Z'),
      publicadoAt: new Date('2026-10-19T12:00:00Z'),
      rawJson: { numeroCompra: '6', anoCompra: '2026', processo: '507/2026' },
    }
    const salvo = await tenders.saveTender(pncp)
    const escondidos = await entreFontes.esconderRepeticoesDaLicitacaoDoPncp(salvo.tenderId, pncp, agora)
    expect(escondidos).toBe(1)
    expect((await doBanco(TOCANTINIA))?.duplicataDe).toBe(salvo.tenderId)
    const contadas = await tenders.prisma.tender.count({ where: { fonte: 'TCE_TO', ...abertas.whereLicitacaoAberta(agora) } })
    expect(contadas).toBe(1)
  })
})
