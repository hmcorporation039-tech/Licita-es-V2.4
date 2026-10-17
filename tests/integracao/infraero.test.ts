import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RedeDaInfraero } from '../../src/services/infraeroVarredura'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const PASTA = join(__dirname, '..', 'fixtures', 'infraero')
const pagina = (nome: string) => readFileSync(join(PASTA, nome)).toString('latin1')
const ABERTA_FUTURA = pagina('detalhe-178262.html')
const SESSAO_PASSADA = pagina('detalhe-178166.html')
const SUSPENSA = pagina('detalhe-178109.html')
const IRP = pagina('detalhe-178260-irp.html')
const CANCELADA = pagina('detalhe-178265-cancelada.html')
const NAO_ENCONTRADA = pagina('detalhe-178200-nao-encontrado.html')

rodar('Infraero — coleta por id gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorInfraero')
  let varredura: typeof import('../../src/services/infraeroVarredura')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-17T15:00:00Z')
  const limites = { maxRequisicoes: 60, naoEncontradosParaParar: 5, saltoDaSonda: 20 }
  const pedidos: number[] = []

  function rede(paginas: Record<number, string>): RedeDaInfraero {
    return {
      baixarDetalhe: async (id) => {
        pedidos.push(id)
        return paginas[id] ?? NAO_ENCONTRADA
      },
      esperar: async () => undefined,
    }
  }

  const doBanco = (id: number) =>
    tenders.prisma.tender.findUnique({ where: { fonteId: `INFRAERO-${id}` } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '200'
    tenders = await import('../../src/services/tenderService')
    varredura = await import('../../src/services/infraeroVarredura')
    abertas = await import('../../src/lib/licitacaoAberta')
    coletor = await import('../../src/workers/coletorInfraero')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await tenders.prisma.tender.deleteMany({ where: { fonte: 'INFRAERO' } })
  }, 60_000)

  afterAll(async () => {
    await tenders?.prisma.tender.deleteMany({ where: { fonte: 'INFRAERO' } })
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('primeira coleta começa no id inicial, grava só o que ainda terá sessão e conta como aberta', async () => {
    const inicio = varredura.INFRAERO_ID_INICIAL
    const resumo = await coletor.coletarInfraero(
      rede({ [inicio]: ABERTA_FUTURA, [inicio + 1]: SESSAO_PASSADA, [inicio + 2]: IRP, [inicio + 4]: SUSPENSA }),
      agora,
      limites
    )

    expect(resumo.inicio).toBe(inicio)
    expect(resumo.totalNew).toBe(2)
    expect(resumo.ignorados).toBe(2)
    expect(resumo.motivoDaParada).toBe('nao_encontrados')
    expect(pedidos[0]).toBe(inicio)

    const salva = await doBanco(inicio)
    expect(salva).toMatchObject({
      fonte: 'INFRAERO',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      uf: 'RJ',
      municipio: 'Rio de Janeiro',
      municipioNorm: 'rio de janeiro',
      orgaoCnpj: '00352294000110',
      numeroControle: '109/ADLI-2/SBRJ/2026',
      linkEdital: `https://licitacao.infraero.gov.br/portal_licitacao/servlet/DetalheLicitacao?idLicitacao=${inicio}`,
    })
    expect(salva?.aberturaAt?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(salva?.encerramentoAt).toBeNull()
    expect(await doBanco(inicio + 1)).toBeNull()
    expect((await doBanco(inicio + 4))?.situacao).toBe('SUSPENSA')

    const contadas = await tenders.prisma.tender.findMany({
      where: { fonte: 'INFRAERO', ...abertas.whereLicitacaoAberta(agora) },
      select: { fonteId: true },
    })
    expect(contadas.map((t) => t.fonteId)).toEqual([`INFRAERO-${inicio}`])
    expect(abertas.estaAberta(salva!, agora)).toBe(true)
  })

  it('a coleta seguinte parte do cursor no banco, atualiza a situação e acha as novas', async () => {
    const inicio = varredura.INFRAERO_ID_INICIAL
    pedidos.length = 0
    const resumo = await coletor.coletarInfraero(
      rede({ [inicio]: CANCELADA, [inicio + 4]: ABERTA_FUTURA, [inicio + 8]: ABERTA_FUTURA }),
      agora,
      limites
    )

    expect(resumo.inicio).toBe(inicio)
    expect(resumo.totalNew).toBe(1)
    expect(resumo.situacoesAlteradas).toBe(2)
    expect((await doBanco(inicio))?.situacao).toBe('CANCELADA')
    const reaberta = await doBanco(inicio + 4)
    expect(reaberta?.situacao).toBe('ABERTA')
    expect(reaberta?.aberturaAt?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(reaberta?.situacaoCheckedAt).toEqual(agora)
    expect((await doBanco(inicio + 8))?.situacao).toBe('ABERTA')
  })

  it('revisita aberta que ficou antes do cursor e recua só um pouco do maior id', async () => {
    const antiga = 150_000
    await tenders.saveTender({
      fonte: 'INFRAERO',
      fonteId: `INFRAERO-${antiga}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: 'Aquisição de pneus',
      aberturaAt: new Date('2026-10-25T13:00:00Z'),
      rawJson: {},
    })
    const maior = varredura.INFRAERO_ID_INICIAL + 8
    pedidos.length = 0
    const resumo = await coletor.coletarInfraero(rede({ [antiga]: CANCELADA }), agora, limites)

    expect(resumo.inicio).toBe(Math.max(varredura.INFRAERO_ID_INICIAL, maior - varredura.RECUO_DO_CURSOR))
    expect(pedidos).toContain(antiga)
    expect(resumo.revisitadas).toBeGreaterThanOrEqual(1)
    expect((await doBanco(antiga))?.situacao).toBe('CANCELADA')
  })
})
