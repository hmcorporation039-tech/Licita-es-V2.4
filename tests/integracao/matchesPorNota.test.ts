import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Meus matches por nota com mais de 5.000 matches', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  let token = ''
  let companyId = ''
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const PROXIMAS = 5000
  const DISTANTES = 60
  const idsDistantes = new Set<string>()

  const http = async (caminho: string) => {
    const r = await fetch(base + caminho, { headers: { Authorization: `Bearer ${token}` } })
    return { status: r.status, body: (await r.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
  }

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

    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `notas-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa Notas ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    companyId = user.companyId
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: SENHA }),
    })
    token = ((await login.json()) as { token: string }).token

    const item = await prisma.monitoredItem.create({
      data: { name: 'Item amplo', keywords: ['papel'], userId: user.id, companyId },
    })

    const agora = Date.now()
    const licitacoes = [
      ...Array.from({ length: DISTANTES }, (_, i) => ({ n: `d${i}`, fim: new Date(agora + 25 * 86_400_000 + i * 1000) })),
      ...Array.from({ length: PROXIMAS }, (_, i) => ({ n: `p${i}`, fim: new Date(agora + 2 * 86_400_000 + i * 1000) })),
    ].map(({ n, fim }) => ({
      id: randomUUID(),
      fonte: 'PNCP',
      fonteId: `notas-${sufixo}-${n}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: 'Aquisição de papel',
      objetoNorm: 'aquisicao de papel',
      publicadoAt: new Date(agora - 86_400_000),
      encerramentoAt: fim,
      rawJson: {},
      distante: n.startsWith('d'),
    }))
    await prisma.tender.createMany({ data: licitacoes.map(({ distante: _distante, ...t }) => t) })
    const matches = licitacoes.map((t) => {
      const id = randomUUID()
      if (t.distante) idsDistantes.add(id)
      return {
        id,
        tenderId: t.id,
        monitoredItemId: item.id,
        companyId,
        userId: user.id,
        score: 0.5,
        matchedKeywords: ['papel'],
        matchedByCode: t.distante,
      }
    })
    await prisma.tenderMatch.createMany({ data: matches })
  }, 120_000)

  afterAll(async () => {
    if (prisma && companyId) {
      await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `notas-${sufixo}-` } } })
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined)
    }
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('o total é a contagem real e a amostra ordenada é a de prazo mais próximo', async () => {
    const r = await http('/api/matches?ordem=nota&pageSize=100')
    expect(r.status).toBe(200)
    expect(r.body.total).toBe(PROXIMAS + DISTANTES)
    expect(r.body.ordenacaoPorNotaLimitadaA).toBe(5000)
    expect(r.body.totalPages).toBe(50)
    expect(r.body.items).toHaveLength(100)
    expect(r.body.items.some((m: { id: string }) => idsDistantes.has(m.id))).toBe(false)
    const notas = r.body.items.map((m: { aderencia: { nota: number } }) => m.aderencia.nota)
    expect([...notas].sort((a: number, b: number) => b - a)).toEqual(notas)
  }, 60_000)

  it('a última página da amostra existe e a seguinte vem vazia', async () => {
    const ultima = await http('/api/matches?ordem=nota&pageSize=100&page=50')
    expect(ultima.body.items).toHaveLength(100)
    const depois = await http('/api/matches?ordem=nota&pageSize=100&page=51')
    expect(depois.body.items).toHaveLength(0)
  }, 60_000)

  it('ordem por mais recentes conta o mesmo total e não avisa limite', async () => {
    const r = await http('/api/matches?pageSize=10')
    expect(r.body.total).toBe(PROXIMAS + DISTANTES)
    expect(r.body.ordenacaoPorNotaLimitadaA).toBeNull()
    expect(r.body.totalPages).toBe(Math.ceil((PROXIMAS + DISTANTES) / 10))
  }, 60_000)

  it('abaixo do teto a ordenação por nota não avisa limite', async () => {
    await prisma.tenderMatch.deleteMany({ where: { companyId, id: { in: [...idsDistantes] } } })
    const r = await http('/api/matches?ordem=nota&pageSize=10')
    expect(r.body.total).toBe(PROXIMAS)
    expect(r.body.ordenacaoPorNotaLimitadaA).toBeNull()
  }, 60_000)
})
