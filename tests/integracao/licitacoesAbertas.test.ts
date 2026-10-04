// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): o filtro do banco
// (whereLicitacaoAberta) e a regra em memória (estaAberta) concordam, e as buscas
// só devolvem licitações abertas.
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Somente licitações abertas', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const agora = new Date()
  const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000)
  let token = ''

  const casos: Record<string, Record<string, unknown>> = {
    prazoFuturo: { encerramentoAt: dias(5), publicadoAt: dias(-400) },
    prazoVencido: { encerramentoAt: dias(-1) },
    homologada: { encerramentoAt: dias(5), valorHomologado: 1000 },
    revogada: { encerramentoAt: dias(5), situacao: 'REVOGADA' },
    dispensaRecente: { publicadoAt: dias(-3), aberturaAt: dias(-3) },
    dispensaDeAnoPassado: { publicadoAt: dias(-500), aberturaAt: dias(-500) },
    sessaoFiegFutura: { fonte: 'FIEG', aberturaAt: dias(2), publicadoAt: dias(-60) },
    sessaoFiegPassada: { fonte: 'FIEG', aberturaAt: dias(-2), publicadoAt: dias(-3) },
  }
  const abertas = ['prazoFuturo', 'dispensaRecente', 'sessaoFiegFutura']

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

    for (const [nome, extra] of Object.entries(casos)) {
      await prisma.tender.create({
        data: {
          fonte: 'PNCP', fonteId: `${nome}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
          objeto: `objeto ${nome} ${sufixo}`, objetoNorm: `objeto ${nome.toLowerCase()} ${sufixo}`, rawJson: {}, ...extra,
        },
      })
    }
    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `abertas-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `E ${sufixo}` } } },
    })
    token = ((await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `abertas-${sufixo}@teste.local`, password: 'Senha-forte-123' }) })).json()) as { token: string }).token
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('o filtro do banco e a regra em memória concordam em todos os casos', async () => {
    const { whereLicitacaoAberta, estaAberta } = await import('../../src/lib/licitacaoAberta')
    const todas = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo } } })
    const noBanco = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo }, ...whereLicitacaoAberta() }, select: { fonteId: true } })
    const nomes = (l: { fonteId: string }[]) => l.map((t) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(nomes(noBanco)).toEqual([...abertas].sort())
    expect(nomes(todas.filter((t: Parameters<typeof estaAberta>[0]) => estaAberta(t)))).toEqual([...abertas].sort())
  })

  it('GET /api/tenders devolve só as abertas', async () => {
    const r = (await (await fetch(`${base}/api/tenders?q=${sufixo}&pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { items: { fonteId: string }[] }
    const nomes = r.items.map((t: { fonteId: string }) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(nomes).toEqual([...abertas].sort())
  })
})
