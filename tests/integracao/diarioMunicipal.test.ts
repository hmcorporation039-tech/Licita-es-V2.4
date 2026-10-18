import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DependenciasDaColeta } from '../../src/services/diarioMunicipalColeta'
import type { AssociacaoSigpub, PaginaDeBusca } from '../../src/services/diarioMunicipalParser'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const PASTA = join(__dirname, '..', 'fixtures', 'sigpub')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const MATERIAS: Record<string, string> = {
  '3D2DAFAD': fixture('materia-famup-3D2DAFAD.html'),
  '58A1B376': fixture('materia-famup-58A1B376.html'),
}

rodar('Diário Municipal (SIGPub) — coleta gravando no banco', () => {
  let coleta: typeof import('../../src/services/diarioMunicipalColeta')
  let parser: typeof import('../../src/services/diarioMunicipalParser')
  let servico: typeof import('../../src/services/diarioMunicipalService')
  let diarios: typeof import('../../src/services/queridoDiarioService')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let salvarLote: typeof import('../../src/workers/coletorHtmlShared').salvarLote
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-17T15:00:00Z')
  const janela = { dataInicio: '2026-10-13', dataFim: '2026-10-17' }
  const CAAPORA = 'DM-2503001:PREGAO:20-2026'
  const ITAPORANGA = 'DM-2507002:PREGAO:33-2026'
  const ids = [CAAPORA, ITAPORANGA, 'QD-2507002:PREGAO:33-2026', 'pncp-sigpub-teste-caapora']

  function paginaDeBusca(): PaginaDeBusca {
    const { cartoes } = parser.lerPaginaDeBusca(fixture('busca-famup-pagina-1.html'))
    return { cartoes: cartoes.filter((c) => c.codigo in MATERIAS), total: 2, temProxima: false }
  }

  function dependencias(lidas: Set<string>, downloads: string[]): DependenciasDaColeta {
    return {
      buscar: async () => paginaDeBusca(),
      baixarMateria: async (_: AssociacaoSigpub, codigo: string) => {
        downloads.push(codigo)
        return MATERIAS[codigo]
      },
      existeNoPncp: diarios.existeNoPncp,
      existeNoQueridoDiario: servico.existeNoQueridoDiario,
      prepararRepublicacao: diarios.prepararRepublicacao,
      salvarLote: (lote) => salvarLote(lote, 'Teste Diário Municipal'),
      memoria: {
        jaLidos: async (chaves) => new Set(chaves.filter((c) => lidas.has(c))),
        marcarLido: async (chave) => {
          lidas.add(chave)
        },
      },
      esperar: async () => undefined,
      agora: () => agora.getTime(),
    }
  }

  async function limpar() {
    await tenders.prisma.tender.deleteMany({ where: { fonteId: { in: ids } } })
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    parser = await import('../../src/services/diarioMunicipalParser')
    servico = await import('../../src/services/diarioMunicipalService')
    diarios = await import('../../src/services/queridoDiarioService')
    coleta = await import('../../src/services/diarioMunicipalColeta')
    salvarLote = (await import('../../src/workers/coletorHtmlShared')).salvarLote
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await limpar()
  }, 60_000)

  afterAll(async () => {
    await limpar()
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava o aviso novo, conta como aberto e não relê a matéria na coleta seguinte', async () => {
    const famup = parser.ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famup')!
    const lidas = new Set<string>()
    const downloads: string[] = []
    const r = await coleta.coletarDiarioMunicipal(dependencias(lidas, downloads), janela, { associacoes: [famup], termos: ['aviso de licitação'] })

    expect(r.porAssociacao).toEqual([expect.objectContaining({ associacao: 'famup', materiasLidas: 2, avisos: 2, novos: 2, duplicadosDoPncp: 0 })])
    const salvo = await tenders.prisma.tender.findUnique({ where: { fonteId: CAAPORA } })
    expect(salvo).toMatchObject({
      fonte: 'DIARIO_MUNICIPAL',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'PB',
      municipio: 'Caaporã',
      municipioNorm: 'caapora',
      municipioIbge: '2503001',
      objeto: 'AQUISIÇÃO DE VEÍCULOS TIPO PASSEIO',
      linkEdital: 'https://www.diariomunicipal.com.br/famup/materia/3D2DAFAD',
    })
    expect(salvo?.aberturaAt?.toISOString()).toBe('2026-10-30T12:30:00.000Z')

    const contadas = await tenders.prisma.tender.findMany({
      where: { fonteId: { in: [CAAPORA, ITAPORANGA] }, ...abertas.whereLicitacaoAberta(agora) },
      select: { fonteId: true },
    })
    expect(contadas.map((t) => t.fonteId).sort()).toEqual([CAAPORA, ITAPORANGA].sort())
    expect(abertas.estaAberta(salvo!, agora)).toBe(true)
    expect(abertas.estaAberta(salvo!, new Date('2026-10-31T12:00:00Z'))).toBe(false)

    const segunda = await coleta.coletarDiarioMunicipal(dependencias(lidas, downloads), janela, { associacoes: [famup], termos: ['aviso de licitação'] })
    expect(downloads).toEqual(['3D2DAFAD', '58A1B376'])
    expect(segunda.jaLidasAntes).toBe(2)
    expect(segunda.totalNew).toBe(0)
  })

  it('não grava o que o PNCP já tem pelo mesmo número nem o que o Querido Diário já trouxe', async () => {
    await limpar()
    await tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: 'pncp-sigpub-teste-caapora',
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: 'Compra de automóveis de passeio conforme emendas',
        objetoNorm: 'compra de automoveis de passeio conforme emendas',
        uf: 'PB',
        municipio: 'Caaporã',
        municipioNorm: 'caapora',
        municipioIbge: '2503001',
        publicadoAt: new Date('2026-10-15T12:00:00Z'),
        encerramentoAt: new Date('2026-10-30T12:00:00Z'),
        rawJson: { numeroCompra: '00020', anoCompra: 2026 },
      },
    })
    await tenders.saveTender({
      fonte: 'QUERIDO_DIARIO',
      fonteId: 'QD-2507002:PREGAO:33-2026',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: 'Manutenção dos aparelhos de ar condicionado da Secretaria de Saúde',
      uf: 'PB',
      municipio: 'Itaporanga',
      municipioIbge: '2507002',
      aberturaAt: new Date('2026-11-03T12:10:00Z'),
      rawJson: {},
    })

    const famup = parser.ASSOCIACOES_SIGPUB.find((a) => a.slug === 'famup')!
    const r = await coleta.coletarDiarioMunicipal(dependencias(new Set(), []), janela, { associacoes: [famup], termos: ['aviso de licitação'] })

    expect(r.porAssociacao[0]).toMatchObject({ avisos: 2, novos: 0, duplicadosDoPncp: 1, duplicadosDoQueridoDiario: 1 })
    expect(await tenders.prisma.tender.findUnique({ where: { fonteId: CAAPORA } })).toBeNull()
    expect(await tenders.prisma.tender.findUnique({ where: { fonteId: ITAPORANGA } })).toBeNull()
  })
})
