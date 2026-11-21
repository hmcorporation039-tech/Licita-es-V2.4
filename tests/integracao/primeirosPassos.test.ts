// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): "Primeiros passos"
// do painel. Aparece só no plano de teste e cada passo é contado pela ação da empresa.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Painel: primeiros passos', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'

  async function pedir(caminho: string, token: string) {
    const res = await fetch(base + caminho, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: await res.json() }
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
    return { usuario: u, token: (await res.json()).token as string }
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

  it('no teste, começa com nada feito e marca o item monitorado sozinho', async () => {
    const { usuario, token } = await entrar('teste', 'TESTE')
    const antes = await pedir('/api/dashboard/primeiros-passos', token)
    expect(antes.status).toBe(200)
    expect(antes.body).toMatchObject({ mostrar: true, feitos: 0, total: 3, matches: 0, buscando: false })

    await prisma.monitoredItem.create({
      data: { companyId: usuario.companyId, userId: usuario.id, name: 'Cadeiras', keywords: ['cadeira'], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] },
    })
    const depois = await pedir('/api/dashboard/primeiros-passos', token)
    expect(depois.body.feitos).toBe(1)
    expect(depois.body.passos[0]).toEqual({ id: 'oQueVende', feito: true })
  })

  it('não aparece para plano pago', async () => {
    const { token } = await entrar('pago', 'EMPRESARIAL')
    const r = await pedir('/api/dashboard/primeiros-passos', token)
    expect(r.status).toBe(200)
    expect(r.body.mostrar).toBe(false)
  })
})
