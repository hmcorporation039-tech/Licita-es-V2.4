// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): o administrador redefine a senha de
// um usuário. Reproduz o caso "Thais1304" (9 caracteres): a API recusa com mensagem clara, e uma
// senha válida (10+) funciona, derruba as sessões antigas e fica na auditoria.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Admin: redefinir a senha de um usuário', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  let tokenAdmin = ''
  let alvoId = ''
  let alvoEmail = ''
  let sessaoAntiga = ''
  let tokenComum = ''

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body }
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
      data: { email: `adm-${sufixo}@teste.local`, passwordHash: hash, isAdmin: true, emailVerifiedAt: new Date(), company: { create: { name: `Admin ${sufixo}`, planCode: 'EMPRESARIAL' } } },
    })
    const alvo = await prisma.user.create({
      data: { email: `alvo-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: new Date(), company: { create: { name: `Alvo ${sufixo}` } } },
    })
    alvoId = alvo.id
    alvoEmail = alvo.email
    await prisma.user.create({
      data: { email: `comum-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: new Date(), company: { create: { name: `Comum ${sufixo}` } } },
    })
    tokenComum = (await http('POST', '/api/auth/login', { email: `comum-${sufixo}@teste.local`, password: SENHA })).body.token
    tokenAdmin = (await http('POST', '/api/auth/login', { email: `adm-${sufixo}@teste.local`, password: SENHA })).body.token
    sessaoAntiga = (await http('POST', '/api/auth/login', { email: alvoEmail, password: SENHA })).body.token
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('senha de 9 caracteres ("Thais1304") é recusada com a mensagem da regra, e a senha antiga continua valendo', async () => {
    const r = await http('POST', `/api/admin/users/${alvoId}/reset-password`, { password: 'Thais1304' }, tokenAdmin)
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toMatch(/pelo menos 10 caracteres/)
    expect((await http('POST', '/api/auth/login', { email: alvoEmail, password: SENHA })).status).toBe(200)
  })

  it('senha com 10 caracteres funciona: a nova entra, a antiga morre e as sessões abertas caem', async () => {
    const r = await http('POST', `/api/admin/users/${alvoId}/reset-password`, { password: 'Thais1304@' }, tokenAdmin)
    expect(r.status).toBe(200)
    expect(r.body.generatedPassword).toBeUndefined() // a senha foi escolhida, não gerada
    expect((await http('POST', '/api/auth/login', { email: alvoEmail, password: 'Thais1304@' })).status).toBe(200)
    expect((await http('POST', '/api/auth/login', { email: alvoEmail, password: SENHA })).status).toBe(401)
    expect((await http('GET', '/api/auth/me', undefined, sessaoAntiga)).status).toBe(401)
    expect(await prisma.auditLog.count({ where: { entityId: alvoId, action: 'SENHA_REDEFINIDA_ADMIN' } })).toBe(1)
  })

  it('sem informar a senha, o sistema gera uma temporária válida', async () => {
    const r = await http('POST', `/api/admin/users/${alvoId}/reset-password`, {}, tokenAdmin)
    expect(r.status).toBe(200)
    expect(r.body.generatedPassword.length).toBeGreaterThanOrEqual(10)
    expect((await http('POST', '/api/auth/login', { email: alvoEmail, password: r.body.generatedPassword })).status).toBe(200)
  })

  it('senha acima de 72 caracteres é recusada', async () => {
    expect((await http('POST', `/api/admin/users/${alvoId}/reset-password`, { password: 'a'.repeat(73) }, tokenAdmin)).status).toBe(400)
  })

  it('usuário comum não pode redefinir a senha de ninguém (403) e nada muda', async () => {
    expect(tokenComum).toBeTruthy()
    const r = await http('POST', `/api/admin/users/${alvoId}/reset-password`, { password: 'Invasora-123456' }, tokenComum)
    expect(r.status).toBe(403)
    expect((await http('POST', '/api/auth/login', { email: alvoEmail, password: 'Invasora-123456' })).status).toBe(401)
  })
})
