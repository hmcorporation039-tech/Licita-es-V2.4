import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RedeDaFamem } from '../../src/services/famemColeta'
import type { MemoriaDeDiarios } from '../../src/services/queridoDiarioColeta'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const PASTA = join(__dirname, '..', 'fixtures', 'famem')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')

const FEIRA_NOVA = 'FAMEM-2104073:PREGAO:10-2026'
const GODOFREDO = 'FAMEM-2104305:PREGAO:18-2026'
const BALSAS = 'FAMEM-2101400:CONCORRENCIA:14-2026'
const RIACHAO = 'FAMEM-2109502:PREGAO:90020-2026'

rodar('FAMEM — coleta gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorFamem')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let entreFontes: typeof import('../../src/services/duplicataEntreFontes')
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-18T15:00:00Z')
  const pedidas: string[] = []
  const lidas = new Set<string>()
  const memoria: MemoriaDeDiarios = {
    jaLidos: async (chaves) => new Set(chaves.filter((c) => lidas.has(c))),
    marcarLido: async (chave) => {
      lidas.add(chave)
    },
  }
  const rede: RedeDaFamem = {
    abrirSessao: async () => 'ci_session=abc123def456',
    baixarLista: async () => fixture('lista-de-publicacoes.json'),
    baixarPublicacao: async (id) => {
      pedidas.push(id)
      return id === '711720' ? fixture('publicacao-inexistente.html') : fixture(`publicacao-${id}.html`)
    },
  }

  const coletar = () => coletor.coletarFamem(coletor.dependenciasDaFamem(rede, memoria, () => agora.getTime(), async () => undefined))
  const doBanco = (fonteId: string) => tenders.prisma.tender.findUnique({ where: { fonteId } })
  const limpar = () => tenders.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'FAMEM' }, { fonteId: { startsWith: 'pncp-famem-teste' } }] } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    entreFontes = await import('../../src/services/duplicataEntreFontes')
    coletor = await import('../../src/workers/coletorFamem')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await limpar()
    await tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: 'pncp-famem-teste-riachao',
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: 'Aquisição de tratores e implementos agrícolas, conforme especificações técnicas, para ampliar a capacidade municipal de manutenção de estradas rurais',
        objetoNorm: 'aquisicao de tratores e implementos agricolas, conforme especificacoes tecnicas, para ampliar a capacidade municipal de manutencao de estradas rurais',
        uf: 'MA',
        municipio: 'Riachão',
        municipioNorm: 'riachao',
        municipioIbge: '2109502',
        orgao: 'MUNICIPIO DE RIACHAO',
        aberturaAt: new Date('2026-10-15T03:00:00Z'),
        encerramentoAt: new Date('2026-11-04T11:59:00Z'),
        publicadoAt: new Date('2026-10-15T12:00:00Z'),
        rawJson: { numeroCompra: '90020', anoCompra: 2026, processo: '557/2026' },
      },
    })
  }, 60_000)

  afterAll(async () => {
    await limpar()
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava os avisos fora do PNCP, descarta o que o PNCP já trouxe e conta como aberta até o dia da sessão', async () => {
    const r = await coletar()

    expect(r).toMatchObject({ lidas: 4, falhasDeLeitura: 1, comSessaoFutura: 4, duplicadosDoPncp: 1, totalNew: 3, contratacoesDiretasPeloTitulo: 2 })
    expect(pedidas).toEqual(['713878', '713802', '713794', '713683', '711720'])
    expect(await doBanco(RIACHAO)).toBeNull()

    const feiraNova = await doBanco(FEIRA_NOVA)
    expect(feiraNova).toMatchObject({
      fonte: 'FAMEM',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'MA',
      municipio: 'Feira Nova do Maranhão',
      municipioNorm: 'feira nova do maranhao',
      municipioIbge: '2104073',
      orgao: 'Prefeitura Municipal de Feira Nova do Maranhão',
      numeroControle: 'Pregão Eletrônico nº 10/2026',
      linkEdital: 'https://feiranovadomaranhao.ma.gov.br/',
    })
    expect(feiraNova?.aberturaAt?.toISOString()).toBe('2026-11-04T11:10:00.000Z')
    expect(JSON.stringify(await tenders.prisma.tender.findMany({ where: { fonte: 'FAMEM' } }))).not.toMatch(/FULAN|exemplo\.com|0000-0000|@gmail/i)

    const contadas = await tenders.prisma.tender.findMany({
      where: { fonte: 'FAMEM', ...abertas.whereLicitacaoAberta(agora) },
      select: { fonteId: true },
      orderBy: { fonteId: 'asc' },
    })
    expect(contadas.map((t) => t.fonteId)).toEqual([BALSAS, FEIRA_NOVA, GODOFREDO])
    expect(abertas.estaAberta(feiraNova!, new Date('2026-11-04T20:00:00Z'))).toBe(true)
    expect(abertas.estaAberta(feiraNova!, new Date('2026-11-05T12:00:00Z'))).toBe(false)
  })

  it('na coleta seguinte não relê as publicações já lidas', async () => {
    const antes = pedidas.length
    const r = await coletar()
    expect(pedidas.slice(antes)).toEqual(['711720'])
    expect(r).toMatchObject({ jaLidasAntes: 4, totalNew: 0 })
  })

  it('quando o PNCP traz a mesma licitação depois, a da FAMEM some das abertas', async () => {
    const pncp = {
      fonte: 'PNCP' as const,
      fonteId: 'pncp-famem-teste-balsas',
      modalidade: 'CONCORRENCIA' as const,
      situacao: 'ABERTA' as const,
      objeto: 'Contratação de agência de propaganda para prestação de serviços de publicidade ao Município de Balsas',
      uf: 'MA',
      municipio: 'Balsas',
      municipioIbge: '2101400',
      orgao: 'MUNICIPIO DE BALSAS',
      aberturaAt: new Date('2026-10-20T12:00:00Z'),
      encerramentoAt: new Date('2026-12-10T11:59:00Z'),
      publicadoAt: new Date('2026-10-20T12:00:00Z'),
      rawJson: { numeroCompra: '14', anoCompra: '2026', processo: '0308.2/2026' },
    }
    const salvo = await tenders.saveTender(pncp)
    const escondidos = await entreFontes.esconderRepeticoesDaLicitacaoDoPncp(salvo.tenderId, pncp, agora)
    expect(escondidos).toBe(1)
    expect((await doBanco(BALSAS))?.duplicataDe).toBe(salvo.tenderId)
    expect((await doBanco(FEIRA_NOVA))?.duplicataDe).toBeNull()
    const contadas = await tenders.prisma.tender.count({ where: { fonte: 'FAMEM', ...abertas.whereLicitacaoAberta(agora) } })
    expect(contadas).toBe(2)
  })

  it('licitação do PNCP de outro número no mesmo município não esconde a da FAMEM', async () => {
    const pncp = {
      fonte: 'PNCP' as const,
      fonteId: 'pncp-famem-teste-godofredo-outra',
      modalidade: 'PREGAO_ELETRONICO' as const,
      situacao: 'ABERTA' as const,
      objeto: 'Contratação de empresa para fornecimento de materiais de limpeza para as secretarias municipais',
      uf: 'MA',
      municipio: 'Godofredo Viana',
      municipioIbge: '2104305',
      orgao: 'MUNICIPIO DE GODOFREDO VIANA',
      aberturaAt: new Date('2026-10-20T12:00:00Z'),
      encerramentoAt: new Date('2026-11-12T12:59:00Z'),
      publicadoAt: new Date('2026-10-20T12:00:00Z'),
      rawJson: { numeroCompra: '25', anoCompra: '2026', processo: '99/2026' },
    }
    const salvo = await tenders.saveTender(pncp)
    expect(await entreFontes.esconderRepeticoesDaLicitacaoDoPncp(salvo.tenderId, pncp, agora)).toBe(0)
    expect((await doBanco(GODOFREDO))?.duplicataDe).toBeNull()
  })
})
