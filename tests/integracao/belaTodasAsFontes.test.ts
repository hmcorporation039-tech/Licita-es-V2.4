import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

interface Lista {
  total: number
  items: Array<{ fonteId: string; fonte: string }>
  porFonte?: Array<{ fonte: string; total: number }>
}

rodar('Bela: "cftv Brasília" acha todas as fontes do DF', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const daquiADezDias = new Date(Date.now() + 10 * 86_400_000)

  // O SESC e o SENAI do DF não informam a cidade, só a UF.
  const licitacoes = [
    { fonte: 'PNCP', nome: 'pncp', municipio: 'Brasília', uf: 'DF' },
    { fonte: 'SISTEMA_S', nome: 'senai', municipio: null, uf: 'DF' },
    { fonte: 'SISTEMA_S', nome: 'sesc', municipio: null, uf: 'DF' },
    { fonte: 'PNCP', nome: 'goiania', municipio: 'Goiânia', uf: 'GO' },
  ]

  const http = async (caminho: string) => {
    const r = await fetch(base + caminho, { headers: { Authorization: `Bearer ${token}` } })
    return { status: r.status, body: (await r.json()) as Lista }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const { normalize } = await import('../../src/lib/geoService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    for (const l of licitacoes) {
      const objeto = `Instalação de sistema de CFTV ${sufixo} (${l.nome})`
      await prisma.tender.create({
        data: {
          fonte: l.fonte, fonteId: `bela-fontes-${l.nome}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
          objeto, objetoNorm: normalize(objeto), uf: l.uf, municipio: l.municipio, municipioNorm: l.municipio ? normalize(l.municipio) : null,
          rawJson: {}, encerramentoAt: daquiADezDias, publicadoAt: new Date(),
        },
      })
    }
    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `bela-fontes-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `CFTV ${sufixo}` } } },
    })
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `bela-fontes-${sufixo}@teste.local`, password: 'Senha-forte-123' }),
    })
    token = ((await login.json()) as { token: string }).token
  }, 60_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { endsWith: sufixo, startsWith: 'bela-fontes-' } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('Brasília traz o PNCP e o Sistema S do DF, e conta por portal', async () => {
    const r = await http(`/api/tenders?q=cftv%20${sufixo}&uf=DF&municipio=Bras%C3%ADlia&contarFontes=true&pageSize=30`)
    expect(r.status).toBe(200)
    expect(r.body.items.map((t) => t.fonteId).sort()).toEqual([`bela-fontes-pncp-${sufixo}`, `bela-fontes-senai-${sufixo}`, `bela-fontes-sesc-${sufixo}`])
    expect(r.body.porFonte).toEqual([{ fonte: 'SISTEMA_S', total: 2 }, { fonte: 'PNCP', total: 1 }])
  }, 30_000)

  it('sem pedir, a lista não traz a contagem; outra cidade continua exata', async () => {
    const r = await http(`/api/tenders?q=cftv%20${sufixo}&municipio=Goi%C3%A2nia`)
    expect(r.body.items.map((t) => t.fonteId)).toEqual([`bela-fontes-goiania-${sufixo}`])
    expect(r.body.porFonte).toBeUndefined()
  }, 30_000)
})
