// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): a API do
// Escritório da Bela. Confere o portão de admin (comum leva 403, admin vê) e a
// forma da resposta, e usa um WorkerLog RUNNING real para provar que a
// Garimpeira fica "trabalhando" com dado de verdade.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

interface Agente {
  id: string
  nome: string
  cargo: string
  ordem: number
  estado: 'ocioso' | 'trabalhando' | 'aguardando'
  tarefaAtual: string
  pedidoAprovacao: string | null
  metricaRotulo: string
  metricaValor: number
  atualizadoEm: string | null
}

rodar('API do Escritório da Bela', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const workerDeTeste = `coletor-teste-${sufixo}`
  let tokenAdmin = ''
  let tokenComum = ''

  async function http(caminho: string, token?: string) {
    const res = await fetch(base + caminho, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const texto = await res.text()
    let body: { agentes?: Agente[]; error?: string } = {}
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
      data: { email: `esc-adm-${sufixo}@teste.local`, passwordHash: hash, isAdmin: true, emailVerifiedAt: new Date(), company: { create: { name: `Escritorio Admin ${sufixo}`, planCode: 'EMPRESARIAL' } } },
    })
    await prisma.user.create({
      data: { email: `esc-comum-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: new Date(), company: { create: { name: `Escritorio Comum ${sufixo}` } } },
    })
    const login = async (email: string) => {
      const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: SENHA }) })
      return ((await r.json()) as { token: string }).token
    }
    tokenAdmin = await login(`esc-adm-${sufixo}@teste.local`)
    tokenComum = await login(`esc-comum-${sufixo}@teste.local`)
  }, 60_000)

  afterAll(async () => {
    await prisma?.workerLog.deleteMany({ where: { worker: workerDeTeste } })
    await prisma?.user.deleteMany({ where: { email: { endsWith: `-${sufixo}@teste.local` } } })
    await prisma?.company.deleteMany({ where: { name: { endsWith: ` ${sufixo}` } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('usuário sem token não acessa (401)', async () => {
    expect((await http('/api/escritorio/status')).status).toBe(401)
  })

  it('usuário comum não é admin (403)', async () => {
    expect((await http('/api/escritorio/status', tokenComum)).status).toBe(403)
  })

  it('admin recebe os 6 agentes na ordem do fluxo, cada um com os campos esperados', async () => {
    const r = await http('/api/escritorio/status', tokenAdmin)
    expect(r.status).toBe(200)
    const agentes = r.body.agentes!
    expect(agentes.map((a) => a.id)).toEqual(['garimpeira', 'casadora', 'analista', 'orcamentista', 'estrategista', 'bela'])
    expect(agentes.map((a) => a.ordem)).toEqual([1, 2, 3, 4, 5, 6])
    for (const a of agentes) {
      expect(typeof a.nome).toBe('string')
      expect(typeof a.cargo).toBe('string')
      expect(['ocioso', 'trabalhando', 'aguardando']).toContain(a.estado)
      expect(typeof a.metricaValor).toBe('number')
    }
    // Só a Bela pode pedir aprovação.
    expect(agentes.filter((a) => a.id !== 'bela').every((a) => a.pedidoAprovacao === null)).toBe(true)
  })

  it('uma coleta RUNNING real deixa a Garimpeira trabalhando', async () => {
    await prisma.workerLog.create({ data: { worker: workerDeTeste, status: 'RUNNING', startedAt: new Date() } })
    const r = await http('/api/escritorio/status', tokenAdmin)
    const garimpeira = r.body.agentes!.find((a) => a.id === 'garimpeira')!
    expect(garimpeira.estado).toBe('trabalhando')
    expect(garimpeira.tarefaAtual).toBe('Garimpando licitações novas')
  })
})
