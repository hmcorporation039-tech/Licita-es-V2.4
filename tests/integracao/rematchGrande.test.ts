import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)
const LICITACOES = 33_000

rodar('Rematch de item com palavra-chave muito comum', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const termo = `parafusos${sufixo}`

  const http = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: r.status, body: (await r.json().catch(() => ({}))) as { id: string; matchesFound: number; matchesEncontrados: number } }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const { hashPassword } = await import('../../src/services/authService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const encerramentoAt = new Date(Date.now() + 10 * 86_400_000)
    await prisma.tender.createMany({
      data: Array.from({ length: LICITACOES }, (_, i) => ({
        fonte: 'PNCP', fonteId: `rematch-${sufixo}-${i}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de ${termo} lote ${i}`, objetoNorm: `aquisicao de ${termo} lote ${i}`, rawJson: {}, encerramentoAt, publicadoAt: new Date(),
      })),
    })
    await prisma.user.create({
      data: { email: `rematch-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `Rematch ${sufixo}` } } },
    })
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `rematch-${sufixo}@teste.local`, password: 'Senha-forte-123' }) })
    token = ((await login.json()) as { token: string }).token
  }, 120_000)

  afterAll(async () => {
    await prisma.tenderMatch.deleteMany({ where: { tender: { fonteId: { startsWith: `rematch-${sufixo}-` } } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `rematch-${sufixo}-` } } })
    await prisma.monitoredItem.deleteMany({ where: { company: { name: `Rematch ${sufixo}` } } })
    await prisma.user.deleteMany({ where: { email: `rematch-${sufixo}@teste.local` } })
    await prisma.company.deleteMany({ where: { name: `Rematch ${sufixo}` } })
    server?.close()
    desconectar()
  }, 120_000)

  it('grava mais de 32.767 oportunidades ao criar o item sem estourar o limite de parâmetros do Postgres, e o rematch seguinte não duplica', async () => {
    const item = await http('POST', '/api/monitored-items', { name: 'Parafusos', keywords: [termo] })
    expect(item.status).toBe(201)
    expect(item.body.matchesEncontrados).toBe(LICITACOES)
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: item.body.id } })).toBe(LICITACOES)
    const repetida = await http('POST', `/api/monitored-items/${item.body.id}/rematch`)
    expect(repetida.status).toBe(200)
    expect(repetida.body.matchesFound).toBe(0)
  }, 180_000)
})
