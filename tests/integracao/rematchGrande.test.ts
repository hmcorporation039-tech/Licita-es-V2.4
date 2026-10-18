import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)
const LICITACOES = 33_000
const DIA_MS = 86_400_000

interface RespostaDoItem {
  id: string
  busca: string
  matchesFound: number
  matchesEncontrados: number
  limitado: boolean
  aviso: string | null
  estado: string
  encontrados: number
}

rodar('Rematch de item com palavra-chave muito comum', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let limite = 0
  let desconectar: () => void = () => undefined
  let token = ''
  let itemId = ''
  const sufixo = randomUUID().slice(0, 8)
  const termo = `parafusos${sufixo}`

  const http = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: r.status, body: (await r.json().catch(() => ({}))) as RespostaDoItem }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ MAX_MATCHES_POR_ITEM: limite } = await import('../../src/lib/limiteDeMatches'))
    const { hashPassword } = await import('../../src/services/authService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const agora = Date.now()
    await prisma.tender.createMany({
      data: Array.from({ length: LICITACOES }, (_, i) => ({
        fonte: 'PNCP', fonteId: `rematch-${sufixo}-${i}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de ${termo} lote ${i}`, objetoNorm: `aquisicao de ${termo} lote ${i}`, rawJson: {},
        encerramentoAt: new Date(agora + (1 + (i % 100)) * DIA_MS + 3_600_000), publicadoAt: new Date(),
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

  it('sem fila, cria o item rodando a busca na hora, mas guarda só as mais aderentes até o limite e avisa', async () => {
    const inicio = Date.now()
    const item = await http('POST', '/api/monitored-items', { name: 'Parafusos', keywords: [termo] })
    console.log(`[rematchGrande] POST com ${LICITACOES} candidatas, busca na própria requisição: ${Date.now() - inicio} ms`)
    itemId = item.body.id
    expect(item.status).toBe(201)
    expect(item.body.busca).toBe('concluida')
    expect(item.body.matchesEncontrados).toBe(limite)
    expect(item.body.limitado).toBe(true)
    expect(item.body.aviso).toMatch(/Palavra muito genérica: mostrando as 2\.000 mais aderentes/)
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(limite)

    const guardados = await prisma.tenderMatch.findMany({ where: { monitoredItemId: itemId }, select: { score: true, tender: { select: { encerramentoAt: true } } } })
    const diasAteOPrazo = guardados.map((m) => Math.floor((m.tender.encerramentoAt!.getTime() - Date.now()) / DIA_MS))
    expect(Math.min(...diasAteOPrazo)).toBeGreaterThanOrEqual(15)
    expect(Math.max(...diasAteOPrazo)).toBeLessThanOrEqual(21)
    expect(new Set(guardados.map((m) => m.score)).size).toBe(1)

    const situacao = await http('GET', `/api/monitored-items/${itemId}/busca`)
    expect(situacao.body).toMatchObject({ estado: 'concluida', encontrados: limite, limitado: true })
  }, 180_000)

  it('"Buscar agora" no limite não grava nada a mais e segue avisando', async () => {
    const repetida = await http('POST', `/api/monitored-items/${itemId}/rematch`)
    expect(repetida.status).toBe(200)
    expect(repetida.body).toMatchObject({ busca: 'concluida', matchesFound: 0, limitado: true })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(limite)
  }, 180_000)

  it('o matcher de licitação nova no limite: a menos aderente não entra, não tira ninguém e não avisa', async () => {
    const { processarLicitacaoNoMatcher } = await import('../../src/workers/matcher')
    await prisma.monitoredItem.update({ where: { id: itemId }, data: { buscaLimitada: false } })
    const nova = await prisma.tender.create({
      data: {
        fonte: 'PNCP', fonteId: `rematch-${sufixo}-nova`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de ${termo} lote novo`, objetoNorm: `aquisicao de ${termo} lote novo`, rawJson: {}, encerramentoAt: new Date(Date.now() + 30 * DIA_MS), publicadoAt: new Date(),
      },
    })
    expect(await processarLicitacaoNoMatcher(nova.id)).toEqual([])
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId, tenderId: nova.id } })).toBe(0)
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(limite)
    expect((await prisma.monitoredItem.findUnique({ where: { id: itemId } }))!.buscaLimitada).toBe(true)

    await prisma.tender.updateMany({ where: { fonteId: { startsWith: `rematch-${sufixo}-` }, tenderMatches: { some: { monitoredItemId: itemId } } }, data: { encerramentoAt: new Date(Date.now() - DIA_MS) } })
    expect(await processarLicitacaoNoMatcher(nova.id)).toHaveLength(1)
  }, 180_000)
})
