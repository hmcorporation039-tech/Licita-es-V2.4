// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): "Bela que acompanha".
// Oferece só no teste, grava a fase por usuário e não oferece mais depois de recusada.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Bela: jornada guiada', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'

  async function pedir(caminho: string, token: string, corpo?: unknown) {
    const res = await fetch(base + caminho, {
      method: corpo ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const body: any = await res.json() // eslint-disable-line @typescript-eslint/no-explicit-any
    return { status: res.status, body }
  }

  async function entrar(prefixo: string, planCode: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `${prefixo} ${sufixo}`, planCode } },
      },
    })
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: SENHA }),
    })
    const corpo = (await res.json()) as { token: string }
    return { usuario: u, token: corpo.token }
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
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('no teste, oferece, grava a fase e lembra o que a pessoa disse', async () => {
    const { usuario, token } = await entrar('jornada', 'TESTE')
    const antes = await pedir('/api/bela/jornada', token)
    expect(antes.status).toBe(200)
    expect(antes.body).toMatchObject({ oferecer: true, estado: null, itens: [], matches: 0, buscando: false })

    const onde = await pedir('/api/bela/jornada', token, { fase: 'onde', termo: 'uniformes escolares' })
    expect(onde.status).toBe(200)
    await pedir('/api/bela/jornada', token, { fase: 'buscando', ufs: ['DF', 'GO'] })

    const agora = await pedir('/api/bela/jornada', token)
    expect(agora.body.oferecer).toBe(true)
    expect(agora.body.estado).toMatchObject({ fase: 'buscando', termo: 'uniformes escolares', ufs: ['DF', 'GO'] })
    const noBanco = await prisma.user.findUnique({ where: { id: usuario.id }, select: { jornadaDaBela: true } })
    expect(noBanco.jornadaDaBela.fase).toBe('buscando')
  })

  it('depois de "não precisa" não oferece mais; fase inválida é recusada', async () => {
    const { token } = await entrar('recusa', 'TESTE')
    expect((await pedir('/api/bela/jornada', token, { fase: 'inventada' })).status).toBe(400)
    await pedir('/api/bela/jornada', token, { fase: 'recusada' })
    expect((await pedir('/api/bela/jornada', token)).body.oferecer).toBe(false)
  })

  it('não oferece para plano pago', async () => {
    const { token } = await entrar('pagoj', 'EMPRESARIAL')
    const r = await pedir('/api/bela/jornada', token)
    expect(r.status).toBe(200)
    expect(r.body.oferecer).toBe(false)
  })
})
