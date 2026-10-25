import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

interface Resposta {
  token: string
  sugestao: { original: string; sugerido: string; similaridade: number } | null
}

rodar('Sugestão de termo: "Você quis dizer esquadrias?"', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const daquiADezDias = new Date(Date.now() + 10 * 86_400_000)

  const objeto = `Fornecimento e instalação de esquadrias de aluminio e vidros temperados ${sufixo}`

  const http = async (caminho: string) => {
    const r = await fetch(base + caminho, { headers: { Authorization: `Bearer ${token}` } })
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Resposta }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const { normalize } = await import('../../src/lib/geoService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    await prisma.tender.create({
      data: {
        fonte: 'PNCP', fonteId: `sugestao-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto, objetoNorm: normalize(objeto), rawJson: {}, encerramentoAt: daquiADezDias, publicadoAt: new Date(),
      },
    })
    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `sugestao-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `Esquadrias ${sufixo}` } } },
    })
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `sugestao-${sufixo}@teste.local`, password: 'Senha-forte-123' }),
    })
    token = ((await login.json()) as Resposta).token
  }, 60_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { startsWith: 'sugestao-' } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('a palavra digitada errada sugere a palavra real do edital', async () => {
    const r = await http('/api/tenders/sugestao-de-termo?termos=esquadrilhas')
    expect(r.status).toBe(200)
    expect(r.body.sugestao?.sugerido).toBe('esquadrias')
    expect(r.body.sugestao?.original).toBe('esquadrilhas')
  }, 20_000)

  it('não sugere quando a palavra já aparece no edital (o plural é tratado antes)', async () => {
    // "esquadria" no singular acha "esquadrias" pela regra de plural — não é erro.
    const r = await http('/api/tenders/sugestao-de-termo?termos=esquadria')
    expect(r.body.sugestao).toBeNull()
  }, 20_000)

  it('não inventa sugestão para palavra sem nada parecido', async () => {
    const r = await http('/api/tenders/sugestao-de-termo?termos=xptoabcz')
    expect(r.body.sugestao).toBeNull()
  }, 20_000)

  it('ignora código e termo composto, mas acha a melhor de vários termos', async () => {
    const r = await http('/api/tenders/sugestao-de-termo?termos=cat6,esquadrilhas')
    expect(r.body.sugestao?.sugerido).toBe('esquadrias')
  }, 20_000)
})
