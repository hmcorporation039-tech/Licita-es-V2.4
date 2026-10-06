// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): endereço completo da empresa e a
// rota de consulta de CEP (exige login e recusa CEP inválido sem consultar serviço externo).
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Empresa: endereço e CEP', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  let tokenDono = ''

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const bytes = Buffer.from(await res.arrayBuffer())
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(bytes.toString('utf8')) } catch { /* não é JSON */ }
    return { status: res.status, body, bytes, tipo: res.headers.get('content-type') ?? '' }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const { hashPassword } = await import('../../src/services/authService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const hash = await hashPassword(SENHA)
    await prisma.user.create({
      data: { email: `dono-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: new Date(), companyRole: 'OWNER', company: { create: { name: `Empresa ${sufixo}` } } },
    })
    tokenDono = (await http('POST', '/api/auth/login', { email: `dono-${sufixo}@teste.local`, password: SENHA })).body.token
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('grava o endereço completo e o devolve na empresa', async () => {
    const r = await http(
      'PATCH',
      '/api/company',
      { cep: '74000-000', endereco: 'Rua das Flores', enderecoNumero: '120', enderecoComplemento: 'Sala 2', enderecoBairro: 'Centro', enderecoCidade: 'Goiânia', enderecoUf: 'GO' },
      tokenDono
    )
    expect(r.status).toBe(200)
    const e = await http('GET', '/api/company', undefined, tokenDono)
    expect(e.body).toMatchObject({ endereco: 'Rua das Flores', enderecoNumero: '120', enderecoBairro: 'Centro', enderecoCidade: 'Goiânia', enderecoUf: 'GO' })
  })

  it('CEP inválido recusa sem consultar serviço externo', async () => {
    const r = await http('GET', '/api/company/cep/123', undefined, tokenDono)
    expect(r.status).toBe(404)
    expect(r.body.error).toMatch(/CEP inválido/)
    expect((await http('GET', '/api/company/cep/74000000')).status).toBe(401)
  })
})
