import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Vitrine pública da página de entrada', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `vitrine-${sufixo}`,
        modalidade: 'PREGAO_ELETRONICO',
        objeto: `Aquisição de vassouras especiais ${sufixo}`,
        objetoNorm: `aquisicao de vassouras especiais ${sufixo}`,
        uf: 'GO',
        municipio: 'Anápolis',
        orgao: 'Prefeitura de Teste',
        encerramentoAt: new Date(Date.now() + 5 * 86_400_000),
        situacao: 'ABERTA',
        contentHash: sufixo,
        rawJson: {},
      },
    })
  })

  afterAll(async () => {
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `vitrine-${sufixo}` } } })
    server?.close()
    desconectar()
  })

  it('mostra o total e até 3 amostras sem expor dados internos', async () => {
    const r = await fetch(`${base}/api/public/vitrine?q=${encodeURIComponent(`vassouras especiais ${sufixo}`)}&uf=go`)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as { total: number; amostras: Array<Record<string, unknown>> }
    expect(corpo.total).toBe(1)
    expect(corpo.amostras[0]).toMatchObject({ orgao: 'Prefeitura de Teste', local: 'Anápolis/GO', fonte: 'PNCP' })
    expect(Object.keys(corpo.amostras[0]).sort()).toEqual(['fonte', 'local', 'objeto', 'orgao', 'prazo'])
  })

  it('só conta o que tem prazo ou sessão confirmados: dispensa sem data e processo sem data coletado há pouco ficam de fora', async () => {
    const termo = `rodos especiais ${sufixo}`
    const comum = { objeto: `Aquisição de ${termo}`, objetoNorm: `aquisicao de ${termo}`, uf: 'GO', situacao: 'ABERTA' as const, rawJson: {}, contentHash: sufixo }
    await prisma.tender.createMany({
      data: [
        { ...comum, fonte: 'PNCP', fonteId: `vitrine-${sufixo}-com-prazo`, modalidade: 'PREGAO_ELETRONICO', encerramentoAt: new Date(Date.now() + 3 * 86_400_000) },
        { ...comum, fonte: 'PNCP', fonteId: `vitrine-${sufixo}-dispensa-sem-data`, modalidade: 'DISPENSA_SEM_DISPUTA', publicadoAt: new Date(Date.now() - 2 * 86_400_000) },
        { ...comum, fonte: 'SEST_SENAT', fonteId: `vitrine-${sufixo}-sem-data`, modalidade: 'OUTROS' },
        { ...comum, fonte: 'SEST_SENAT', fonteId: `vitrine-${sufixo}-sessao-futura`, modalidade: 'OUTROS', aberturaAt: new Date(Date.now() + 4 * 86_400_000) },
      ],
    })
    const corpo = (await (await fetch(`${base}/api/public/vitrine?q=${encodeURIComponent(termo)}`)).json()) as { total: number }
    expect(corpo.total).toBe(2)
  })

  it('curingas do LIKE são buscados como texto e não devolvem a base inteira', async () => {
    for (const q of ['%%%', '___', `vassouras%${sufixo}`]) {
      const r = (await (await fetch(`${base}/api/public/vitrine?q=${encodeURIComponent(q)}`)).json()) as { total: number }
      expect(r.total).toBe(0)
    }
    const literal = (await (await fetch(`${base}/api/public/vitrine?q=${encodeURIComponent(`vassouras especiais ${sufixo}`)}`)).json()) as { total: number }
    expect(literal.total).toBe(1)
  })

  it('recusa busca curta demais e informa as estatísticas', async () => {
    expect((await fetch(`${base}/api/public/vitrine?q=ab`)).status).toBe(400)
    const e = (await (await fetch(`${base}/api/public/estatisticas`)).json()) as { abertas: number; fontes: number }
    expect(e.abertas).toBeGreaterThanOrEqual(1)
    expect(e.fontes).toBeGreaterThanOrEqual(1)
  })
})
