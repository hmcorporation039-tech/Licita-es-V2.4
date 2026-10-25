// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): favoritar e
// desfavoritar licitação, idempotência dos dois lados, "Minhas salvas" e o
// isolamento por empresa (uma empresa nunca vê o favorito da outra).
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Favoritar licitação', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  let tenderId = ''
  let outraTenderId = ''

  async function tokenDeEmpresa(rotulo: string): Promise<string> {
    const { hashPassword } = await import('../../src/services/authService')
    const email = `fav-${rotulo}-${sufixo}@teste.local`
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `E ${rotulo} ${sufixo}` } } },
    })
    const r = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Senha-forte-123' }) })).json()) as { token: string }
    return r.token
  }

  let tokenA = ''
  let tokenB = ''

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

    const criar = async (nome: string) =>
      (await prisma.tender.create({
        data: {
          fonte: 'PNCP', fonteId: `${nome}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
          objeto: `objeto ${nome} ${sufixo}`, objetoNorm: `objeto ${nome} ${sufixo}`,
          encerramentoAt: new Date(Date.now() + 5 * 86_400_000), publicadoAt: new Date(Date.now() - 10 * 86_400_000), uf: 'SP', rawJson: {},
        },
      })).id
    tenderId = await criar('favorita')
    outraTenderId = await criar('outra')
    tokenA = await tokenDeEmpresa('a')
    tokenB = await tokenDeEmpresa('b')
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

  it('favoritar devolve favoritada:true e aparece em Minhas salvas e nos ids', async () => {
    const post = await fetch(`${base}/api/tenders/${tenderId}/favorito`, { method: 'POST', headers: auth(tokenA) })
    expect(post.status).toBe(201)
    expect(await post.json()).toEqual({ favoritada: true })

    const lista = (await (await fetch(`${base}/api/tenders/favoritas`, { headers: auth(tokenA) })).json()) as { tender: { id: string } }[]
    expect(lista.map((f) => f.tender.id)).toEqual([tenderId])

    const ids = (await (await fetch(`${base}/api/tenders/favoritas/ids`, { headers: auth(tokenA) })).json()) as { ids: string[] }
    expect(ids.ids).toContain(tenderId)
  })

  it('favoritar duas vezes não duplica', async () => {
    await fetch(`${base}/api/tenders/${tenderId}/favorito`, { method: 'POST', headers: auth(tokenA) })
    const quantas = await prisma.tenderFavorito.count({ where: { tenderId } })
    expect(quantas).toBe(1)
  })

  it('a empresa B não enxerga o favorito da empresa A', async () => {
    const lista = (await (await fetch(`${base}/api/tenders/favoritas`, { headers: auth(tokenB) })).json()) as unknown[]
    expect(lista).toEqual([])
    const ids = (await (await fetch(`${base}/api/tenders/favoritas/ids`, { headers: auth(tokenB) })).json()) as { ids: string[] }
    expect(ids.ids).toEqual([])
  })

  it('desfavoritar devolve favoritada:false e some da lista (idempotente)', async () => {
    const del = await fetch(`${base}/api/tenders/${tenderId}/favorito`, { method: 'DELETE', headers: auth(tokenA) })
    expect(del.status).toBe(200)
    expect(await del.json()).toEqual({ favoritada: false })

    const deNovo = await fetch(`${base}/api/tenders/${tenderId}/favorito`, { method: 'DELETE', headers: auth(tokenA) })
    expect(deNovo.status).toBe(200)

    const lista = (await (await fetch(`${base}/api/tenders/favoritas`, { headers: auth(tokenA) })).json()) as unknown[]
    expect(lista).toEqual([])
  })

  it('favoritar licitação inexistente dá 404', async () => {
    const r = await fetch(`${base}/api/tenders/${randomUUID()}/favorito`, { method: 'POST', headers: auth(tokenA) })
    expect(r.status).toBe(404)
  })

  it('"favoritas" não é confundida com o id de uma licitação', async () => {
    const r = await fetch(`${base}/api/tenders/favoritas`, { headers: auth(tokenA) })
    expect(r.status).toBe(200)
    expect(Array.isArray(await r.json())).toBe(true)
    expect(outraTenderId).not.toBe('')
  })
})
