// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): o administrador apaga de vez
// uma conta de teste. Só conta sozinha na empresa e sem assinatura/pagamento; pede o e-mail
// digitado para confirmar; nunca a própria conta nem a de outro admin.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Admin: apagar usuário', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  let tokenAdmin = ''
  let adminId = ''
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

  async function criarConta(prefixo: string) {
    const { hashPassword } = await import('../../src/services/authService')
    return prisma.user.create({
      data: {
        email: `${prefixo}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `${prefixo} ${sufixo}` } },
      },
    })
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

    const adm = await prisma.user.create({
      data: { email: `adm-${sufixo}@teste.local`, passwordHash: await hashPassword(SENHA), isAdmin: true, emailVerifiedAt: new Date(), company: { create: { name: `Admin ${sufixo}`, planCode: 'EMPRESARIAL' } } },
    })
    adminId = adm.id
    await criarConta('comum')
    tokenComum = (await http('POST', '/api/auth/login', { email: `comum-${sufixo}@teste.local`, password: SENHA })).body.token
    tokenAdmin = (await http('POST', '/api/auth/login', { email: `adm-${sufixo}@teste.local`, password: SENHA })).body.token
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('apaga a conta de teste e a empresa dele, com o e-mail confirmado', async () => {
    const alvo = await criarConta('alvo')
    const errado = await http('DELETE', `/api/admin/users/${alvo.id}`, { confirmarEmail: 'outro@teste.local' }, tokenAdmin)
    expect(errado.status).toBe(400)
    expect(await prisma.user.count({ where: { id: alvo.id } })).toBe(1)

    const r = await http('DELETE', `/api/admin/users/${alvo.id}`, { confirmarEmail: alvo.email.toUpperCase() }, tokenAdmin)
    expect(r.status).toBe(200)
    expect(await prisma.user.count({ where: { id: alvo.id } })).toBe(0)
    expect(await prisma.company.count({ where: { id: alvo.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { entityId: alvo.id, action: 'USUARIO_APAGADO' } })).toBe(1)
  })

  it('conta que já teve assinatura não é apagada', async () => {
    const pago = await criarConta('pago')
    await prisma.assinatura.create({
      data: { companyId: pago.companyId, planCode: 'EMPRESARIAL', ciclo: 'MENSAL', ambiente: 'sandbox', asaasClienteId: `cus_${sufixo}`, valorCentavos: 100, valorCheioCentavos: 100 },
    })
    const r = await http('DELETE', `/api/admin/users/${pago.id}`, { confirmarEmail: pago.email }, tokenAdmin)
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/Desativar/)
    expect(await prisma.user.count({ where: { id: pago.id } })).toBe(1)
  })

  it('não apaga a própria conta nem a de quem tem colegas na empresa', async () => {
    expect((await http('DELETE', `/api/admin/users/${adminId}`, { confirmarEmail: `adm-${sufixo}@teste.local` }, tokenAdmin)).status).toBe(400)

    const dono = await criarConta('dono')
    await prisma.user.create({ data: { email: `colega-${sufixo}@teste.local`, companyId: dono.companyId, companyRole: 'MEMBER' } })
    const r = await http('DELETE', `/api/admin/users/${dono.id}`, { confirmarEmail: dono.email }, tokenAdmin)
    expect(r.status).toBe(409)
    expect(await prisma.user.count({ where: { companyId: dono.companyId } })).toBe(2)
  })

  it('usuário comum não pode apagar ninguém', async () => {
    const alvo = await criarConta('alvo2')
    expect((await http('DELETE', `/api/admin/users/${alvo.id}`, { confirmarEmail: alvo.email }, tokenComum)).status).toBe(403)
    expect(await prisma.user.count({ where: { id: alvo.id } })).toBe(1)
  })
})
