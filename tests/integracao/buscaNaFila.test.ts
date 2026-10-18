import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const URL_REDIS = process.env.TEST_REDIS_URL
const rodar = describe.skipIf(!URL_BANCO || !URL_REDIS)
const LICITACOES = 33_000
const DIA_MS = 86_400_000

function gerarCpf(): string {
  const d = Array.from({ length: 9 }, () => randomInt(0, 10))
  for (const tam of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tam; i++) soma += d[i] * (tam + 1 - i)
    d.push(((soma * 10) % 11) % 10)
  }
  return d.join('')
}

interface Resposta {
  id: string
  busca: string
  matchesFound?: number
  matchesEncontrados?: number
  estado: string
  encontrados: number | null
  limitado: boolean
  token: string
}

rodar('Busca do item em fila (Redis de verdade)', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let fila: typeof import('../../src/queues').rematchItemQueue
  let worker: { close: () => Promise<void> } | undefined
  let iniciarWorker: () => { close: () => Promise<void> }
  let caixa: { to: string; codigo?: string }[] = []
  let limite = 0
  let desconectar: () => void = () => undefined
  let token = ''
  let itemId = ''
  const sufixo = randomUUID().slice(0, 8)
  const termo = `arruelas${sufixo}`
  const empresa = `Fila ${sufixo}`
  const email = (n: string) => `fila-${n}-${sufixo}@teste.local`

  const http = async (metodo: string, caminho: string, corpo?: unknown, comToken = true) => {
    const inicio = Date.now()
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(comToken ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: r.status, ms: Date.now() - inicio, body: (await r.json().catch(() => ({}))) as Resposta }
  }

  const esperarFimDaBusca = async (id: string, esperaMaximaMs = 120_000) => {
    const limiteDeEspera = Date.now() + esperaMaximaMs
    for (;;) {
      const situacao = await http('GET', `/api/monitored-items/${id}/busca`)
      if (situacao.body.estado !== 'em-andamento' && (await jobsDoItem(id)).length === 0) return situacao.body
      if (Date.now() > limiteDeEspera) throw new Error('a busca não terminou a tempo')
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  const jobsDoItem = async (id: string) => (await fila.getJobs(['waiting', 'active', 'delayed'])).filter((j) => j.data.itemId === id)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.REDIS_URL = URL_REDIS
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '2000'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ MAX_MATCHES_POR_ITEM: limite } = await import('../../src/lib/limiteDeMatches'))
    ;({ caixaDeSaidaDeTeste: caixa } = await import('../../src/services/emailTransacional'))
    const filas = await import('../../src/queues')
    const { startRematchItemWorker } = await import('../../src/workers/rematchItem')
    const { hashPassword } = await import('../../src/services/authService')
    fila = filas.rematchItemQueue
    iniciarWorker = startRematchItemWorker
    desconectar = () => filas.redisConnection.disconnect()
    for (let i = 0; i < 100 && filas.redisConnection.status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 50))
    expect(filas.redisConnection.status).toBe('ready')
    await fila.obliterate({ force: true })

    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const agora = Date.now()
    await prisma.tender.createMany({
      data: Array.from({ length: LICITACOES }, (_, i) => ({
        fonte: 'PNCP', fonteId: `fila-${sufixo}-${i}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de ${termo} lote ${i}`, objetoNorm: `aquisicao de ${termo} lote ${i}`, rawJson: {},
        encerramentoAt: new Date(agora + (1 + (i % 100)) * DIA_MS + 3_600_000), publicadoAt: new Date(),
      })),
    })
    await prisma.user.create({
      data: { email: email('dono'), passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: empresa } } },
    })
    token = (await http('POST', '/api/auth/login', { email: email('dono'), password: 'Senha-forte-123' }, false)).body.token
  }, 180_000)

  afterAll(async () => {
    await worker?.close()
    await fila?.obliterate({ force: true }).catch(() => undefined)
    await fila?.close()
    await prisma.tenderMatch.deleteMany({ where: { tender: { fonteId: { startsWith: `fila-${sufixo}-` } } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `fila-${sufixo}-` } } })
    const usuarios = await prisma.user.findMany({ where: { email: { endsWith: `-${sufixo}@teste.local` } }, select: { companyId: true } })
    const empresas = usuarios.map((u) => u.companyId)
    await prisma.monitoredItem.deleteMany({ where: { companyId: { in: empresas } } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: empresas } } })
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${sufixo}@teste.local` } } }).catch(() => undefined)
    server?.close()
    desconectar()
  }, 120_000)

  it('cria o item com palavra genérica e responde na hora, sem esperar a busca; "Buscar agora" repetido vira um job só', async () => {
    const aquecimento = await http('POST', '/api/monitored-items', { name: 'Aquecimento', keywords: [`nadaconsta${sufixo}`] })
    console.log(`[buscaNaFila] primeiro POST do processo (aquecimento): ${aquecimento.ms} ms`)
    const aquecimento2 = await http('POST', '/api/monitored-items', { name: 'Aquecimento 2', keywords: [`nadaconsta2${sufixo}`] })
    console.log(`[buscaNaFila] segundo POST do processo (aquecimento): ${aquecimento2.ms} ms`)
    const criado = await http('POST', '/api/monitored-items', { name: 'Arruelas', keywords: [termo] })
    console.log(`[buscaNaFila] POST com ${LICITACOES} candidatas, busca em fila: ${criado.ms} ms`)
    expect(criado.status).toBe(201)
    expect(criado.ms).toBeLessThan(1_000)
    expect(criado.body.busca).toBe('em-andamento')
    expect(criado.body.matchesEncontrados).toBeUndefined()
    itemId = criado.body.id
    expect((await http('GET', `/api/monitored-items/${itemId}/busca`)).body).toMatchObject({ estado: 'em-andamento' })

    const pedidos = await Promise.all([1, 2, 3].map(() => http('POST', `/api/monitored-items/${itemId}/rematch`)))
    expect(pedidos.map((p) => [p.status, p.body.busca])).toEqual([[200, 'em-andamento'], [200, 'em-andamento'], [200, 'em-andamento']])
    expect((await jobsDoItem(itemId)).map((j) => j.data.modo).sort()).toEqual(['buscar-agora', 'criacao'])

    worker = iniciarWorker()
    const inicio = Date.now()
    const situacao = await esperarFimDaBusca(itemId)
    console.log(`[buscaNaFila] criação + "Buscar agora" processados pelo worker em ${Date.now() - inicio} ms`)
    expect(situacao).toMatchObject({ estado: 'concluida', limitado: true })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(limite)
    expect(await jobsDoItem(itemId)).toHaveLength(0)
    const lista = await http('GET', '/api/monitored-items')
    expect((lista.body as unknown as { id: string; situacaoDaBusca: { limitado: boolean; aviso: string } }[]).find((i) => i.id === itemId)?.situacaoDaBusca).toMatchObject({ limitado: true, aviso: expect.stringMatching(/2\.000 mais aderentes/) })
  }, 240_000)

  it('editar o recorte responde na hora e a reavaliação na fila tira os matches que deixaram de valer', async () => {
    const editado = await http('PATCH', `/api/monitored-items/${itemId}`, { palavrasDeExclusao: ['lote'] })
    expect(editado.status).toBe(200)
    expect(editado.ms).toBeLessThan(1_000)
    expect(editado.body.busca).toBe('em-andamento')
    const situacao = await esperarFimDaBusca(itemId)
    console.log(`[buscaNaFila] PATCH com exclusão no item genérico: ${editado.ms} ms`)
    expect(situacao).toMatchObject({ estado: 'concluida', encontrados: 0, removidos: limite, limitado: false })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(0)

    const renomeado = await http('PATCH', `/api/monitored-items/${itemId}`, { name: 'Arruelas inox' })
    expect(renomeado.body.busca).toBeUndefined()
    expect(await jobsDoItem(itemId)).toHaveLength(0)
  }, 240_000)

  it('desativar só desliga o item; ativar responde na hora e a busca roda na fila', async () => {
    const desativado = await http('PATCH', `/api/monitored-items/${itemId}`, { active: false })
    console.log(`[buscaNaFila] Desativar: ${desativado.ms} ms`)
    expect(desativado.status).toBe(200)
    expect(desativado.ms).toBeLessThan(1_000)
    expect(desativado.body.busca).toBeUndefined()
    expect(await jobsDoItem(itemId)).toHaveLength(0)

    const semExclusao = await http('PATCH', `/api/monitored-items/${itemId}`, { palavrasDeExclusao: [] })
    expect(semExclusao.body.busca).toBe('em-andamento')
    expect(await esperarFimDaBusca(itemId)).toMatchObject({ estado: 'concluida', encontrados: 0 })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(0)

    const ativado = await http('PATCH', `/api/monitored-items/${itemId}`, { active: true })
    console.log(`[buscaNaFila] Ativar: ${ativado.ms} ms`)
    expect(ativado.ms).toBeLessThan(1_000)
    expect(ativado.body.busca).toBe('em-andamento')
    expect((await jobsDoItem(itemId)).map((j) => j.data.modo)).toEqual(['ativacao'])
    expect(await esperarFimDaBusca(itemId)).toMatchObject({ estado: 'concluida', encontrados: limite, limitado: true, removidos: null })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: itemId } })).toBe(limite)
  }, 240_000)

  it('no cadastro, confirmar o e-mail espera a busca curta do primeiro item e a pessoa já entra vendo licitações', async () => {
    const termoDoCadastro = `porcas${sufixo}`
    await prisma.tender.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        fonte: 'PNCP', fonteId: `fila-${sufixo}-cadastro-${i}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de ${termoDoCadastro} ${i}`, objetoNorm: `aquisicao de ${termoDoCadastro} ${i}`, rawJson: {}, encerramentoAt: new Date(Date.now() + 20 * DIA_MS), publicadoAt: new Date(),
      })),
    })
    const cadastro = await http('POST', '/api/auth/register', {
      nome: 'Pessoa da Fila', email: email('cadastro'), senha: 'Senha-forte-123', tipo: 'PESSOA_FISICA', documento: gerarCpf(), aceiteTermos: true,
      interesse: { termo: termoDoCadastro },
    }, false)
    expect(cadastro.status).toBe(202)
    const codigo = [...caixa].reverse().find((m) => m.to === email('cadastro'))?.codigo
    const confirmado = await http('POST', '/api/auth/verify-email', { email: email('cadastro'), codigo }, false)
    expect(confirmado.status).toBe(200)
    const usuario = await prisma.user.findUnique({ where: { email: email('cadastro') } })
    const [item] = await prisma.monitoredItem.findMany({ where: { companyId: usuario!.companyId } })
    expect(item).toMatchObject({ buscaEstado: 'CONCLUIDA', buscaEncontrados: 3 })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: item.id } })).toBe(3)
  }, 120_000)
})
