// ============================================================
// Teste de integração da nota de aderência com PostgreSQL real: o matcher
// grava a nota, o feed devolve o detalhamento ao vivo e ordena por nota, e a
// nota de uma empresa não vaza para outra. Só roda com TEST_DATABASE_URL.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Nota de aderência', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matcher: any
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const ids: Record<string, string> = {}
  const tokens: Record<string, string> = {}
  const orgao = `Orgao Aderencia ${sufixo}`

  async function http(metodo: string, caminho: string, quem: string, corpo?: unknown) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[quem]}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body }
  }

  async function criarConta(chave: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `${chave}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${chave} ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    ids[chave] = user.id
    ids[`empresa${chave}`] = user.companyId
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: SENHA }),
    })
    tokens[chave] = ((await r.json()) as { token: string }).token
  }

  const emDias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    matcher = await import('../../src/services/matcherService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await criarConta('a')
    await criarConta('b')
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  let tenderId = ''
  let itemCodigo = ''
  let itemPalavra = ''

  it('o matcher grava nota maior para código CATMAT do que para palavra-chave, e marca matchedByCode', async () => {
    const tender = await prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `aderencia-${sufixo}`,
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: 'Aquisição de notebooks para a secretaria',
        objetoNorm: 'aquisicao de notebooks para a secretaria',
        orgao,
        orgaoNorm: orgao.toLowerCase(),
        uf: 'DF',
        valorEstimado: 50_000,
        publicadoAt: new Date(),
        encerramentoAt: emDias(20),
        rawJson: {},
        items: { create: [{ descricao: 'Notebook 15 polegadas', descricaoNorm: 'notebook 15 polegadas', catmatCode: '123456' }] },
      },
    })
    tenderId = tender.id

    const a = await http('POST', '/api/monitored-items', 'a', { name: 'Por código', catmatCodes: ['123456'] })
    const b = await http('POST', '/api/monitored-items', 'a', { name: 'Por palavra', keywords: ['notebooks'] })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    itemCodigo = a.body.id
    itemPalavra = b.body.id

    const candidatos = (await matcher.findMatchCandidates(tenderId)).filter(
      (c: { monitoredItemId: string }) => [itemCodigo, itemPalavra].includes(c.monitoredItemId)
    )
    const porCodigo = candidatos.find((c: { monitoredItemId: string }) => c.monitoredItemId === itemCodigo)
    const porPalavra = candidatos.find((c: { monitoredItemId: string }) => c.monitoredItemId === itemPalavra)

    expect(porCodigo.matchedByCode).toBe(true)
    expect(porPalavra.matchedByCode).toBe(false)
    // código: 50 (objeto) + 20 (20 dias) + 8 (sem faixa) + 8 (nacional) = 86
    expect(porCodigo.score).toBeCloseTo(0.86, 5)
    // 1 de 1 palavra: 35 + 20 + 8 + 8 = 71
    expect(porPalavra.score).toBeCloseTo(0.71, 5)

    for (const c of candidatos) {
      await prisma.tenderMatch.create({
        data: { tenderId, monitoredItemId: c.monitoredItemId, companyId: c.companyId, userId: c.userId, score: c.score, matchedKeywords: c.matchedKeywords, matchedByCode: c.matchedByCode },
      })
    }
  })

  it('o feed devolve a nota ao vivo com o motivo de cada critério', async () => {
    const r = await http('GET', '/api/matches?incluirForaDoPrazo=true', 'a')
    expect(r.status).toBe(200)
    const mc = r.body.items.find((m: { monitoredItemId: string }) => m.monitoredItemId === itemCodigo)
    expect(mc.aderencia.nota).toBe(86)
    expect(mc.aderencia.faixa).toBe('alta')
    expect(mc.aderencia.criterios.map((c: { id: string }) => c.id)).toEqual(['objeto', 'prazo', 'valor', 'localizacao'])
    expect(mc.aderencia.criterios.every((c: { motivo: string }) => c.motivo.length > 5)).toBe(true)
    const mp = r.body.items.find((m: { monitoredItemId: string }) => m.monitoredItemId === itemPalavra)
    expect(mp.aderencia.nota).toBe(71)
    expect(mp.aderencia.faixa).toBe('boa')
  })

  it('ordem=nota põe a maior nota primeiro e a paginação respeita a ordem', async () => {
    // O mais antigo é o de código; sem ordenar por nota ele ficaria por último.
    await prisma.tenderMatch.updateMany({ where: { monitoredItemId: itemCodigo }, data: { createdAt: new Date(Date.now() - 3_600_000) } })

    const padrao = await http('GET', '/api/matches?incluirForaDoPrazo=true&pageSize=50', 'a')
    const posPadrao = padrao.body.items.findIndex((m: { monitoredItemId: string }) => m.monitoredItemId === itemCodigo)
    const posPalavraPadrao = padrao.body.items.findIndex((m: { monitoredItemId: string }) => m.monitoredItemId === itemPalavra)
    expect(posPadrao).toBeGreaterThan(posPalavraPadrao)

    const porNota = await http('GET', '/api/matches?incluirForaDoPrazo=true&ordem=nota&pageSize=50', 'a')
    const notas = porNota.body.items.map((m: { aderencia: { nota: number } }) => m.aderencia.nota)
    expect([...notas].sort((x: number, y: number) => y - x)).toEqual(notas)
    const posCodigo = porNota.body.items.findIndex((m: { monitoredItemId: string }) => m.monitoredItemId === itemCodigo)
    const posPalavra = porNota.body.items.findIndex((m: { monitoredItemId: string }) => m.monitoredItemId === itemPalavra)
    expect(posCodigo).toBeLessThan(posPalavra)

    // página 1 e 2 de tamanho 1 não repetem nem pulam
    const p1 = await http('GET', '/api/matches?incluirForaDoPrazo=true&ordem=nota&pageSize=1&page=1', 'a')
    const p2 = await http('GET', '/api/matches?incluirForaDoPrazo=true&ordem=nota&pageSize=1&page=2', 'a')
    expect(p1.body.items).toHaveLength(1)
    expect(p1.body.items[0].id).not.toBe(p2.body.items[0].id)
    expect(p1.body.items[0].aderencia.nota).toBeGreaterThanOrEqual(p2.body.items[0].aderencia.nota)
    expect(p1.body.total).toBe(porNota.body.total)
  })

  it('valor de ordem inválido é recusado', async () => {
    expect((await http('GET', '/api/matches?ordem=aleatoria', 'a')).status).toBe(400)
  })

  it('a nota de uma empresa não aparece para a outra', async () => {
    const r = await http('GET', '/api/matches?incluirForaDoPrazo=true&ordem=nota', 'b')
    expect(r.body.items).toHaveLength(0)
    expect(r.body.total).toBe(0)
  })

  it('a lista de licitações classifica como "exata" quando houve match por código', async () => {
    const r = await http('GET', `/api/tenders?somenteRelacionadas=true&orgao=${encodeURIComponent(orgao)}`, 'a')
    expect(r.status).toBe(200)
    const t = r.body.items.find((x: { id: string }) => x.id === tenderId)
    expect(t.match.classificacao).toBe('exata')
    expect(t.match.score).toBeCloseTo(0.86, 5)
  })

  it('match antigo (antes da nota) continua legível: score 1 vira "por código"', async () => {
    const antigo = await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `antigo-${sufixo}`, modalidade: 'OUTROS', objeto: 'x', rawJson: {}, publicadoAt: new Date(), encerramentoAt: emDias(10) },
    })
    const m = await prisma.tenderMatch.create({
      data: { tenderId: antigo.id, monitoredItemId: itemCodigo, companyId: ids.empresaa, userId: ids.a, score: 1, matchedKeywords: [], matchedByCode: true },
    })
    const r = await http('GET', '/api/matches?incluirForaDoPrazo=true&pageSize=100', 'a')
    const achado = r.body.items.find((x: { id: string }) => x.id === m.id)
    expect(achado.aderencia.criterios[0].pontos).toBe(50)
  })
})
