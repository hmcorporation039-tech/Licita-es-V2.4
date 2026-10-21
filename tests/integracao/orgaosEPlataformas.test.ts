import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/tenderChangeService', () => ({
  avisarAlteracaoDeTender: vi.fn(async () => 0),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const payloadReal = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'pncp', 'proposta-central-de-compras-pb.json'), 'utf8'))

rodar('Órgãos e plataformas de origem nos números públicos', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let alcance: typeof import('../../src/services/alcanceDasLicitacoes')
  let aberta: typeof import('../../src/lib/licitacaoAberta')
  let coletor: typeof import('../../src/workers/coletorPNCP')
  let mudancas: typeof import('../../src/services/tenderChangeService')
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `alcance-${sufixo}-`
  const raizDoCnpj = String(parseInt(sufixo.slice(0, 6), 16) % 1_000_000).padStart(6, '0')
  const cnpj = (n: number) => `${raizDoCnpj}${String(n).padStart(8, '0')}`
  const dias = (n: number) => new Date(Date.now() + n * 86_400_000)
  const plataformaGrande = `Plataforma Grande ${sufixo}`
  const plataformaMedia = `Plataforma Média ${sufixo}`
  const plataformaPequena = `Plataforma Pequena ${sufixo}`
  const plataformaSoEncerrada = `Plataforma Só Encerrada ${sufixo}`
  const orgaoQuePublicaSozinho = `PREFEITURA MUNICIPAL DE TESTE ${sufixo}`

  const doPrefixo = () => ({ AND: [aberta.whereLicitacaoComPrazoConfirmado(), { fonteId: { startsWith: prefixo } }] })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    alcance = await import('../../src/services/alcanceDasLicitacoes')
    aberta = await import('../../src/lib/licitacaoAberta')
    coletor = await import('../../src/workers/coletorPNCP')
    mudancas = await import('../../src/services/tenderChangeService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const comum = { modalidade: 'PREGAO_ELETRONICO' as const, situacao: 'ABERTA' as const, objeto: `Aquisição de teste ${sufixo}`, rawJson: {}, contentHash: sufixo, publicadoAt: dias(-2) }
    const linhas = Array.from({ length: 5_000 }, (_, i) => {
      const plataforma = i < 3_000 ? plataformaGrande : i < 4_200 ? plataformaMedia : i < 4_500 ? plataformaPequena : i < 4_700 ? orgaoQuePublicaSozinho : null
      return {
        ...comum,
        fonte: 'PNCP' as const,
        fonteId: `${prefixo}aberta-${i}`,
        orgaoCnpj: cnpj(i % 1_250),
        plataformaDeOrigem: plataforma,
        encerramentoAt: dias(5 + (i % 20)),
      }
    })
    const encerradas = Array.from({ length: 300 }, (_, i) => ({
      ...comum,
      fonte: 'PNCP' as const,
      fonteId: `${prefixo}encerrada-${i}`,
      orgaoCnpj: cnpj(5_000 + i),
      plataformaDeOrigem: plataformaSoEncerrada,
      encerramentoAt: dias(-1),
    }))
    const semPrazo = Array.from({ length: 50 }, (_, i) => ({
      ...comum,
      fonte: 'PNCP' as const,
      modalidade: 'DISPENSA_SEM_DISPUTA' as const,
      fonteId: `${prefixo}sem-prazo-${i}`,
      orgaoCnpj: cnpj(6_000 + i),
      plataformaDeOrigem: plataformaSoEncerrada,
    }))
    const deOutraFonte = Array.from({ length: 40 }, (_, i) => ({
      ...comum,
      fonte: 'TCE_TO' as const,
      fonteId: `${prefixo}tce-to-${i}`,
      orgaoCnpj: cnpj(7_000 + i),
      encerramentoAt: dias(7),
    }))
    for (let i = 0; i < linhas.length; i += 1_000) await prisma.tender.createMany({ data: linhas.slice(i, i + 1_000) })
    await prisma.tender.createMany({ data: [...encerradas, ...semPrazo, ...deOutraFonte] })
  }, 120_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    server?.close()
    desconectar()
  })

  it('conta órgãos e plataformas só das licitações com prazo confirmado, sem o órgão que publica sozinho', async () => {
    const r = await alcance.alcanceDasLicitacoes(doPrefixo())
    expect(r.orgaos).toBe(1_250 + 40)
    expect(r.plataformas).toBe(3)
    expect(r.principaisPlataformas).toEqual([plataformaGrande, plataformaMedia, plataformaPequena])
    expect(r.principaisPlataformas).not.toContain(plataformaSoEncerrada)
    expect(r.principaisPlataformas).not.toContain(orgaoQuePublicaSozinho)
  })

  it('fonte que não é o PNCP conta órgão mas não conta plataforma', async () => {
    const soTceTo = await alcance.alcanceDasLicitacoes({ AND: [aberta.whereLicitacaoComPrazoConfirmado(), { fonteId: { startsWith: `${prefixo}tce-to-` } }] })
    expect(soTceTo).toEqual({ orgaos: 40, plataformas: 0, principaisPlataformas: [] })
  })

  it('a contagem na base inteira é rápida e a rota pública devolve os campos novos sem perder os antigos', async () => {
    const inicio = performance.now()
    const r = await alcance.alcanceDasLicitacoes(aberta.whereLicitacaoComPrazoConfirmado())
    const duracao = performance.now() - inicio
    console.log(`[alcance] órgãos ${r.orgaos}, plataformas ${r.plataformas} em ${duracao.toFixed(0)} ms`)
    expect(duracao).toBeLessThan(3_000)

    const resposta = await fetch(`${base}/api/public/estatisticas`)
    expect(resposta.status).toBe(200)
    const e = (await resposta.json()) as Record<string, unknown>
    expect(e).toHaveProperty('fontes')
    expect(e).toHaveProperty('marcas')
    expect(e.orgaos as number).toBeGreaterThanOrEqual(1_290)
    expect(e.plataformas as number).toBeGreaterThanOrEqual(3)
    expect((e.principaisPlataformas as string[]).length).toBeLessThanOrEqual(12)
    expect(e.principaisPlataformas as string[]).toContain(plataformaGrande)
  })

  it('a recoleta preenche a coluna em licitação já gravada sem contar como alterada nem avisar ninguém', async () => {
    const encerramento = dias(10).toISOString().slice(0, 19)
    const payload = { ...payloadReal, numeroControlePNCP: `${prefixo}recoleta`, dataEncerramentoProposta: encerramento }
    const contadores = () => ({ vistos: 0, novos: 0, atualizados: 0, inalterados: 0, descartados: 0, comErro: 0 })

    const primeira = contadores()
    await coletor.gravarContratacoesPncp([{ ...payload, usuarioNome: undefined }], primeira, 'teste')
    expect(primeira.novos).toBe(1)
    const antes = await prisma.tender.findUniqueOrThrow({ where: { fonteId: `${prefixo}recoleta` } })
    expect(antes.plataformaDeOrigem).toBeNull()

    vi.mocked(mudancas.avisarAlteracaoDeTender).mockClear()
    const segunda = contadores()
    await coletor.gravarContratacoesPncp([payload], segunda, 'teste')
    expect(segunda).toMatchObject({ novos: 0, atualizados: 0, inalterados: 1, comErro: 0 })
    expect(mudancas.avisarAlteracaoDeTender).not.toHaveBeenCalled()
    const depois = await prisma.tender.findUniqueOrThrow({ where: { fonteId: `${prefixo}recoleta` } })
    expect(depois.plataformaDeOrigem).toBe('Central de Compras da Paraíba/PB')
    expect(depois.contentHash).toBe(antes.contentHash)

    const terceira = contadores()
    await coletor.gravarContratacoesPncp([{ ...payload, usuarioNome: undefined }], terceira, 'teste')
    expect(terceira.inalterados).toBe(1)
    expect((await prisma.tender.findUniqueOrThrow({ where: { fonteId: `${prefixo}recoleta` } })).plataformaDeOrigem).toBe('Central de Compras da Paraíba/PB')

    const quarta = contadores()
    await coletor.gravarContratacoesPncp([{ ...payload, usuarioNome: 'BLL Compras', dataEncerramentoProposta: dias(12).toISOString().slice(0, 19) }], quarta, 'teste')
    expect(quarta.atualizados).toBe(1)
    expect(mudancas.avisarAlteracaoDeTender).toHaveBeenCalledWith(depois.id, ['encerramentoAt'])
    expect((await prisma.tender.findUniqueOrThrow({ where: { fonteId: `${prefixo}recoleta` } })).plataformaDeOrigem).toBe('BLL Compras')
  })
})
