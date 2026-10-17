import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

interface Corpo {
  id: string
  token: string
  palavrasDeExclusao: string[]
  items: Array<{ monitoredItemId: string; dentroDeObraCompleta: boolean; aderencia: { criterios: Array<{ id: string; motivo: string }> } }>
}

rodar('Busca precisa: plural, palavras de exclusão e obra completa', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const daquiADezDias = new Date(Date.now() + 10 * 86_400_000)

  const licitacoes: Record<string, string> = {
    plural: `Fornecimento e instalação de esquadrias de alumínio ${sufixo}`,
    ferramenta: `Aquisição de ferramentas: serra de esquadria 7 1/4 ${sufixo}`,
    obra: `Execução da obra de construção do CREAS ${sufixo}, com movimento de terra; drenagem; fundações; estruturas; alvenarias; cobertura; esquadrias, vidros e espelhos; instalações hidrossanitárias`,
  }

  const http = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Corpo }
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

    for (const [nome, objeto] of Object.entries(licitacoes)) {
      await prisma.tender.create({
        data: {
          fonte: 'PNCP', fonteId: `busca-${nome}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
          objeto, objetoNorm: normalize(objeto), rawJson: {}, encerramentoAt: daquiADezDias, publicadoAt: new Date(),
        },
      })
    }
    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `busca-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `Esquadrias ${sufixo}` } } },
    })
    token = (await http('POST', '/api/auth/login', { email: `busca-${sufixo}@teste.local`, password: 'Senha-forte-123' })).body.token
  }, 60_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { startsWith: 'busca-' } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const ligadas = async (itemId: string) => {
    const matches = await prisma.tenderMatch.findMany({ where: { monitoredItemId: itemId }, include: { tender: { select: { fonteId: true } } } })
    return Object.fromEntries(
      matches
        .filter((m: { tender: { fonteId: string } }) => m.tender.fonteId.endsWith(sufixo))
        .map((m: { tender: { fonteId: string }; dentroDeObraCompleta: boolean }) => [m.tender.fonteId.replace(`busca-`, '').replace(`-${sufixo}`, ''), m.dentroDeObraCompleta]),
    )
  }

  it('o singular acha o plural, a palavra de exclusão tira a ferramenta e a obra completa vem marcada', async () => {
    const criado = await http('POST', '/api/monitored-items', { name: 'Esquadria', keywords: ['esquadria'], palavrasDeExclusao: ['serra'] })
    expect(criado.status).toBe(201)
    expect(criado.body.palavrasDeExclusao).toEqual(['serra'])
    expect((await http('POST', `/api/monitored-items/${criado.body.id}/rematch`)).status).toBe(200)
    expect(await ligadas(criado.body.id)).toEqual({ plural: false, obra: true })
  }, 30_000)

  it('sem palavra de exclusão a ferramenta entra, e a lista de matches põe a obra completa por último', async () => {
    const criado = await http('POST', '/api/monitored-items', { name: 'Esquadria sem filtro', keywords: ['esquadrias'] })
    await http('POST', `/api/monitored-items/${criado.body.id}/rematch`)
    expect(await ligadas(criado.body.id)).toEqual({ plural: false, ferramenta: false, obra: true })

    const lista = await http('GET', '/api/matches?pageSize=100&ordem=recentes')
    const deste = lista.body.items.filter((m) => m.monitoredItemId === criado.body.id)
    expect(deste[deste.length - 1].dentroDeObraCompleta).toBe(true)
    const obra = deste.find((m) => m.dentroDeObraCompleta)!
    expect(obra.aderencia.criterios.find((c) => c.id === 'objeto')!.motivo).toMatch(/obra completa/)
  }, 30_000)

  it('recusa lista de exclusão grande demais', async () => {
    const r = await http('POST', '/api/monitored-items', { name: 'X', keywords: ['x1'], palavrasDeExclusao: Array.from({ length: 51 }, (_, i) => `palavra${i}`) })
    expect(r.status).toBe(400)
  })
})
