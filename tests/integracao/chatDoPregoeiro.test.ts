// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): monitor do chat do
// pregoeiro — a extensão manda as mensagens, a API classifica, não repete,
// separa por empresa e lista em "Minhas sessões".
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Chat do pregoeiro', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const CNPJ = `1${sufixo.replace(/\D/g, '').padEnd(8, '7').slice(0, 7)}000190`.slice(0, 14)
  let tokenA = ''
  let tokenB = ''
  let tenderId = ''

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = await res.json() } catch { /* não é JSON */ }
    return { status: res.status, body }
  }

  async function criarConta(nome: string, empresa: Record<string, unknown> = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${nome}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${nome} ${sufixo}`, ...empresa } },
      },
    })
    return (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string
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
    tokenA = await criarConta('chata', { tipo: 'PESSOA_JURIDICA', cnpj: CNPJ })
    tokenB = await criarConta('chatb')
    const t = await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `chat-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA', objeto: `Câmeras ${sufixo}`, orgao: 'Prefeitura de Teste', rawJson: {} },
    })
    tenderId = t.id
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('grava, classifica e não repete as mensagens enviadas pela extensão', async () => {
    const mensagens = [
      { autor: 'Pregoeiro', texto: 'Bom dia a todos, iniciaremos a fase de lances.', horaNoPortal: '09:00' },
      { autor: 'Pregoeiro', texto: `Fornecedor ${CNPJ}, envie a proposta atualizada em anexo em até 2 horas.`, horaNoPortal: '10:12' },
      { autor: 'Pregoeiro', texto: 'A sessão será suspensa e retomada às 14h.', horaNoPortal: '10:30' },
    ]
    const r = await http('POST', `/api/tenders/${tenderId}/pregao/mensagens`, { mensagens }, tokenA)
    expect(r.status).toBe(201)
    expect(r.body.novas).toBe(3)
    expect(r.body.urgentes).toBe(2)
    expect(r.body.naoLidas).toBe(3)
    const doc = r.body.mensagens.find((m: { categoria: string }) => m.categoria === 'DOCUMENTO')
    expect(doc).toMatchObject({ citaAEmpresa: true, urgente: true, rotulo: 'Pedido de documento' })

    const repetido = await http('POST', `/api/tenders/${tenderId}/pregao/mensagens`, { mensagens }, tokenA)
    expect(repetido.body.novas).toBe(0)
    expect(repetido.body.mensagens).toHaveLength(3)
  })

  it('outra empresa não vê o chat da primeira', async () => {
    const r = await http('GET', `/api/tenders/${tenderId}/pregao/mensagens`, undefined, tokenB)
    expect(r.status).toBe(200)
    expect(r.body.mensagens).toEqual([])
  })

  it('"Minhas sessões" põe os urgentes primeiro e marcar como lidas zera a contagem', async () => {
    const s = await http('GET', '/api/sessoes', undefined, tokenA)
    expect(s.status).toBe(200)
    const sessao = s.body.sessoes.find((x: { tenderId: string }) => x.tenderId === tenderId)
    expect(sessao).toMatchObject({ naoLidas: 3, urgentes: 2, orgao: 'Prefeitura de Teste' })
    const lidas = await http('POST', `/api/tenders/${tenderId}/pregao/mensagens/lidas`, {}, tokenA)
    expect(lidas.body.marcadas).toBe(3)
    expect(lidas.body.naoLidas).toBe(0)
  })

  it('recusa corpo inválido, licitação inexistente e acesso sem login', async () => {
    expect((await http('POST', `/api/tenders/${tenderId}/pregao/mensagens`, { mensagens: [] }, tokenA)).status).toBe(400)
    expect((await http('POST', `/api/tenders/${randomUUID()}/pregao/mensagens`, { mensagens: [{ texto: 'oi' }] }, tokenA)).status).toBe(404)
    expect((await http('GET', '/api/sessoes')).status).toBe(401)
  })
})
