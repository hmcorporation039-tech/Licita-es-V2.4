// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): "Portal dentro da Bela" —
// a API diz se o recurso está ligado e autoriza a sessão do serviço navegador.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Portal dentro da Bela', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const anterior = process.env.NAVEGADOR_URL

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> }
  }

  async function conta(nome: string, planCode: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: { email: `portal-${nome}-${sufixo}@teste.local`, passwordHash: await hashPassword(SENHA), emailVerifiedAt: new Date(), company: { create: { name: `Portal ${sufixo} ${nome}`, planCode } } },
    })
    return { id: u.id as string, companyId: u.companyId as string, token: (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    delete process.env.NAVEGADOR_URL
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)

  afterAll(async () => {
    if (anterior === undefined) delete process.env.NAVEGADOR_URL
    else process.env.NAVEGADOR_URL = anterior
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Portal ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.tenderParticipationPlan.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.tender.deleteMany({ where: { fonteId: `portal-${sufixo}` } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  it('só abre com o serviço ligado, no plano pago e na licitação escolhida', async () => {
    const paga = await conta('paga', 'PROFISSIONAL')
    const gratis = await conta('gratis', 'TESTE')
    const tender = await prisma.tender.create({
      data: {
        fonte: 'PNCP', fonteId: `portal-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: 'Pregão de teste do portal', objetoNorm: 'pregao de teste do portal', orgao: 'Órgão teste', orgaoNorm: 'orgao teste', uf: 'ES', publicadoAt: new Date(), rawJson: {},
      },
    })

    // Desligado: a tela mostra que não está ativado, e a sessão é recusada.
    expect((await http('GET', '/api/portal-na-bela/config', undefined, paga.token)).body).toMatchObject({ disponivel: false, url: null, planoGratuito: false })
    expect((await http('POST', '/api/portal-na-bela/sessao', { tenderId: tender.id }, paga.token)).body.code).toBe('NAVEGADOR_NAO_CONFIGURADO')

    process.env.NAVEGADOR_URL = 'https://navegador.exemplo.app/'
    expect((await http('GET', '/api/portal-na-bela/config', undefined, paga.token)).body).toMatchObject({ disponivel: true, url: 'wss://navegador.exemplo.app' })
    expect((await http('GET', '/api/portal-na-bela/config', undefined, gratis.token)).body.planoGratuito).toBe(true)

    const semPlano = await http('POST', '/api/portal-na-bela/sessao', { tenderId: tender.id }, gratis.token)
    expect(semPlano.status).toBe(403)
    expect(semPlano.body.code).toBe('PORTAL_SO_NOS_PLANOS')

    expect((await http('POST', '/api/portal-na-bela/sessao', { tenderId: tender.id }, paga.token)).status).toBe(409)
    await prisma.tenderParticipationPlan.create({ data: { companyId: paga.companyId, userId: paga.id, tenderId: tender.id, status: 'VOU_PARTICIPAR', state: {} } })
    const ok = await http('POST', '/api/portal-na-bela/sessao', { tenderId: tender.id }, paga.token)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ userId: paga.id, companyId: paga.companyId, tenderId: tender.id })
    expect(String(ok.body.inicio)).toMatch(/^https:\/\/www\.comprasnet\.gov\.br\//)
    expect(await prisma.auditLog.count({ where: { companyId: paga.companyId, action: 'PORTAL_NA_BELA_ABERTO' } })).toBe(1)

    expect((await http('POST', '/api/portal-na-bela/sessao', { tenderId: tender.id })).status).toBe(401)
  })
})
