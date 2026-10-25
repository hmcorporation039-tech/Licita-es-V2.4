// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): base do
// Estrategista de Habilitação — criar análise de concorrente, subir documento
// (PDF), listar/obter, isolamento por empresa, recusa de não-PDF e remoção.
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Estrategista de Habilitação (base)', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  let tokenA = ''
  let tokenB = ''
  let tenderId = ''

  async function tokenDeEmpresa(rotulo: string): Promise<string> {
    const { hashPassword } = await import('../../src/services/authService')
    const email = `conc-${rotulo}-${sufixo}@teste.local`
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `E ${rotulo} ${sufixo}` } } },
    })
    const r = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Senha-forte-123' }) })).json()) as { token: string }
    return r.token
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
    tokenA = await tokenDeEmpresa('a')
    tokenB = await tokenDeEmpresa('b')
    tenderId = (await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `conc-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA', objeto: `obj ${sufixo}`, objetoNorm: `obj ${sufixo}`, encerramentoAt: new Date(Date.now() + 5 * 86_400_000), uf: 'SP', rawJson: {} },
    })).id
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

  interface Analise {
    id: string
    tenderId: string
    nomeConcorrente: string | null
    status: string
    arquivos: { id: string; nomeArquivo: string; tamanho: number }[]
  }

  it('cria análise, sobe PDF e aparece na listagem', async () => {
    const criada = (await (await fetch(`${base}/api/concorrentes`, { method: 'POST', headers: auth(tokenA), body: JSON.stringify({ tenderId, nomeConcorrente: `Concorrente ${sufixo} Ltda` }) })).json()) as Analise
    expect(criada.status).toBe('PENDING')
    expect(criada.arquivos).toEqual([])

    const comArquivo = (await (await fetch(`${base}/api/concorrentes/${criada.id}/arquivos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/pdf' },
      body: PDF,
    })).json()) as Analise
    expect(comArquivo.arquivos.length).toBe(1)
    expect(comArquivo.arquivos[0].tamanho).toBe(PDF.length)

    const lista = (await (await fetch(`${base}/api/concorrentes?tenderId=${tenderId}`, { headers: auth(tokenA) })).json()) as Analise[]
    expect(lista.map((a) => a.id)).toContain(criada.id)
  })

  it('a empresa B não vê nem acessa a análise da empresa A', async () => {
    const criada = (await (await fetch(`${base}/api/concorrentes`, { method: 'POST', headers: auth(tokenA), body: JSON.stringify({ tenderId, nomeConcorrente: 'Secreta' }) })).json()) as Analise
    const listaB = (await (await fetch(`${base}/api/concorrentes?tenderId=${tenderId}`, { headers: auth(tokenB) })).json()) as Analise[]
    expect(listaB.find((a) => a.id === criada.id)).toBeUndefined()
    const getB = await fetch(`${base}/api/concorrentes/${criada.id}`, { headers: auth(tokenB) })
    expect(getB.status).toBe(404)
  })

  it('recusa arquivo que não é PDF/JPG/PNG', async () => {
    const criada = (await (await fetch(`${base}/api/concorrentes`, { method: 'POST', headers: auth(tokenA), body: JSON.stringify({ tenderId }) })).json()) as Analise
    const r = await fetch(`${base}/api/concorrentes/${criada.id}/arquivos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('isto nao e um documento valido'),
    })
    expect(r.status).toBe(415)
  })

  it('criar análise para licitação inexistente dá 404; remover tira da lista', async () => {
    const r = await fetch(`${base}/api/concorrentes`, { method: 'POST', headers: auth(tokenA), body: JSON.stringify({ tenderId: randomUUID() }) })
    expect(r.status).toBe(404)

    const criada = (await (await fetch(`${base}/api/concorrentes`, { method: 'POST', headers: auth(tokenA), body: JSON.stringify({ tenderId }) })).json()) as Analise
    const del = await fetch(`${base}/api/concorrentes/${criada.id}`, { method: 'DELETE', headers: auth(tokenA) })
    expect(del.status).toBe(204)
    const getDepois = await fetch(`${base}/api/concorrentes/${criada.id}`, { headers: auth(tokenA) })
    expect(getDepois.status).toBe(404)
  })
})
