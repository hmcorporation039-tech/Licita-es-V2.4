import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/emailService', async (original) => ({
  ...(await original<typeof import('../../src/services/emailService')>()),
  sendMatchEmail: vi.fn(async () => undefined),
  sendDocumentExpiryEmail: vi.fn(async () => undefined),
  sendResumoDiarioEmail: vi.fn(async () => true),
}))

vi.mock('../../src/services/rematchService', async (original) => {
  const real = await original<typeof import('../../src/services/rematchService')>()
  return { ...real, enfileirarAvisosDeMatch: vi.fn(real.enfileirarAvisosDeMatch) }
})

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)
const DIA_MS = 86_400_000
const MINUTO_MS = 60_000

rodar('Limite de matches por item, fila fora do ar e avisos para teste encerrado', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let limite = 0
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const letras = sufixo.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])
  const termo = (nome: string) => `zq${nome}${letras}ta`
  const prefixo = `lim-${sufixo}-`
  const senha = 'Senha-forte-123'

  const licitacao = (nome: string, objeto: string, diasAtePrazo: number, extraMs = 0) => ({
    fonte: 'PNCP' as const,
    fonteId: `${prefixo}${nome}`,
    modalidade: 'PREGAO_ELETRONICO' as const,
    situacao: 'ABERTA' as const,
    objeto,
    objetoNorm: objeto.toLowerCase(),
    rawJson: {},
    encerramentoAt: new Date(Date.now() + diasAtePrazo * DIA_MS + extraMs),
    publicadoAt: new Date(Date.now() - DIA_MS),
  })

  const conta = async (nome: string, extra: Record<string, unknown> = {}) => {
    const { hashPassword } = await import('../../src/services/authService')
    return prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        passwordHash: await hashPassword(senha),
        emailVerifiedAt: new Date(),
        ...extra,
        company: { create: { name: `Limite ${sufixo} ${nome}` } },
      },
    })
  }

  const entrar = async (email: string) => {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) })
    return ((await r.json()) as { token: string }).token
  }

  const itemDe = (user: { id: string; companyId: string }, nome: string, palavra: string) =>
    prisma.monitoredItem.create({ data: { name: nome, keywords: [palavra], companyId: user.companyId, userId: user.id } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '5000'
    process.env.REDIS_URL = 'redis://127.0.0.1:1'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ MAX_MATCHES_POR_ITEM: limite } = await import('../../src/lib/limiteDeMatches'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 120_000)

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: prefixo } } } })
    await prisma.tenderParticipationPlan.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tenderMatch.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    await prisma.companyDocument.deleteMany({ where: { user: { email: { startsWith: prefixo } } } })
    await prisma.monitoredItem.deleteMany({ where: { company: { name: { startsWith: `Limite ${sufixo}` } } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { name: { startsWith: `Limite ${sufixo}` } } })
    server?.close()
    desconectar()
  }, 120_000)

  describe('item no limite de matches', () => {
    let user: { id: string; companyId: string; email: string }
    let item: { id: string }
    let token = ''
    let palavra = ''
    let pontuacao = 0
    const ids: Record<string, string> = {}

    beforeAll(async () => {
      user = await conta('limite')
      token = await entrar(user.email)
      palavra = termo('lim')
      item = await itemDe(user, 'Parafusos', palavra)

      const nova = await prisma.tender.create({ data: licitacao('nova-mais-aderente', `Aquisição de ${palavra} lote novo`, 20) })
      ids.nova = nova.id
      const { findMatchCandidates } = await import('../../src/services/matcherService')
      pontuacao = (await findMatchCandidates(nova.id)).find((c) => c.monitoredItemId === item.id)!.score

      await prisma.tender.createMany({
        data: Array.from({ length: limite }, (_, i) => licitacao(`cheio-${i}`, `Aquisição de ${palavra} lote ${i}`, 22, i * MINUTO_MS)),
      })
      const cheias = await prisma.tender.findMany({ where: { fonteId: { startsWith: `${prefixo}cheio-` } }, select: { id: true, fonteId: true } })
      for (const t of cheias) ids[t.fonteId.slice(prefixo.length)] = t.id
      await prisma.tenderMatch.createMany({
        data: cheias.map((t: { id: string }) => ({ tenderId: t.id, monitoredItemId: item.id, companyId: user.companyId, userId: user.id, score: pontuacao, matchedKeywords: [palavra], read: true })),
      })
      await prisma.tenderParticipationPlan.create({ data: { companyId: user.companyId, userId: user.id, tenderId: ids[`cheio-${limite - 1}`], state: {} } })
    }, 120_000)

    const temMatch = async (tenderId: string) => (await prisma.tenderMatch.count({ where: { monitoredItemId: item.id, tenderId } })) === 1
    const abertos = () => prisma.tenderMatch.count({ where: { monitoredItemId: item.id } })

    it('licitação nova mais aderente entra, tira a menos aderente não escolhida e vai para o resumo diário', async () => {
      const { processarLicitacaoNoMatcher } = await import('../../src/workers/matcher')
      const { enfileirarAvisosDeMatch } = await import('../../src/services/rematchService')
      const { processarMatch } = await import('../../src/workers/notificador')
      const { sendMatchEmail } = await import('../../src/services/emailService')
      vi.mocked(enfileirarAvisosDeMatch).mockClear()

      const criados = await processarLicitacaoNoMatcher(ids.nova)
      expect(criados).toHaveLength(1)
      expect(enfileirarAvisosDeMatch).toHaveBeenCalledWith(criados, 'Matcher Worker')
      expect(await temMatch(ids.nova)).toBe(true)
      expect(await temMatch(ids[`cheio-${limite - 1}`])).toBe(true)
      expect(await temMatch(ids[`cheio-${limite - 2}`])).toBe(false)
      expect(await abertos()).toBe(limite)
      expect((await prisma.monitoredItem.findUnique({ where: { id: item.id } }))!.buscaLimitada).toBe(true)

      vi.mocked(sendMatchEmail).mockClear()
      await processarMatch({ tenderMatchId: criados[0] })
      expect(sendMatchEmail).not.toHaveBeenCalled()

      const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
      const { sendResumoDiarioEmail } = await import('../../src/services/emailService')
      vi.mocked(sendResumoDiarioEmail).mockClear()
      expect(await enviarResumoDoUsuario(user.id)).toBe('enviado')
      expect(vi.mocked(sendResumoDiarioEmail).mock.calls[0][0]).toBe(user.email)
      expect(vi.mocked(sendResumoDiarioEmail).mock.calls[0][1].map((l) => l.tenderId)).toContain(ids.nova)
    }, 60_000)

    it('licitação nova menos aderente não entra, não tira ninguém e não gera e-mail', async () => {
      const { processarLicitacaoNoMatcher } = await import('../../src/workers/matcher')
      const { enfileirarAvisosDeMatch } = await import('../../src/services/rematchService')
      const pior = await prisma.tender.create({ data: licitacao('nova-menos-aderente', `Aquisição de ${palavra} lote distante`, 40) })
      ids.pior = pior.id
      vi.mocked(enfileirarAvisosDeMatch).mockClear()

      expect(await processarLicitacaoNoMatcher(pior.id)).toEqual([])
      expect(enfileirarAvisosDeMatch).not.toHaveBeenCalled()
      expect(await temMatch(pior.id)).toBe(false)
      expect(await temMatch(ids[`cheio-${limite - 3}`])).toBe(true)
      expect(await abertos()).toBe(limite)
    }, 60_000)

    it('"Buscar agora" no limite também troca a menos aderente pela mais aderente', async () => {
      const intermediaria = await prisma.tender.create({ data: licitacao('intermediaria', `Aquisição de ${palavra} lote intermediário`, 21) })
      const inicio = Date.now()
      const r = await fetch(`${base}/api/monitored-items/${item.id}/rematch`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const corpo = (await r.json()) as { busca: string; matchesFound: number; limitado: boolean; aviso: string }
      expect(Date.now() - inicio).toBeLessThan(10_000)
      expect(r.status).toBe(200)
      expect(corpo).toMatchObject({ busca: 'concluida', matchesFound: 1, limitado: true })
      expect(corpo.aviso).toMatch(/novas licitações substituem as menos aderentes/)
      expect(await temMatch(intermediaria.id)).toBe(true)
      expect(await temMatch(ids[`cheio-${limite - 3}`])).toBe(false)
      expect(await temMatch(ids.pior)).toBe(false)
      expect(await temMatch(ids[`cheio-${limite - 1}`])).toBe(true)
      expect(await abertos()).toBe(limite)
    }, 60_000)
  })

  it('sem Redis, "Buscar agora" com mais de 20 matches novos responde rápido e grava todos', async () => {
    const user = await conta('semfila')
    const token = await entrar(user.email)
    const palavra = termo('fila')
    const item = await itemDe(user, 'Sem fila', palavra)
    await prisma.tender.createMany({ data: Array.from({ length: 25 }, (_, i) => licitacao(`fila-${i}`, `Compra de ${palavra} lote ${i}`, 20 + i)) })

    const inicio = Date.now()
    const r = await fetch(`${base}/api/monitored-items/${item.id}/rematch`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const corpo = (await r.json()) as { busca: string; matchesFound: number }
    const duracao = Date.now() - inicio
    console.log(`[limiteEAvisos] "Buscar agora" sem Redis com 25 matches novos: ${duracao} ms`)
    expect(duracao).toBeLessThan(10_000)
    expect(corpo).toMatchObject({ busca: 'concluida', matchesFound: 25 })
    expect(await prisma.tenderMatch.count({ where: { monitoredItemId: item.id } })).toBe(25)
  }, 60_000)

  it('teste encerrado: não manda e-mail de match nem de documento; manda um único aviso com a contagem', async () => {
    const ontem = new Date(Date.now() - DIA_MS)
    const user = await conta('encerrado', { accessExpiresAt: ontem })
    const palavra = termo('fim')
    const item = await itemDe(user, 'Cimento', palavra)
    const objetos = ['primeira', 'segunda', 'terceira'].map((n) => `Fornecimento de ${palavra} ${n}`)
    const tenders = await Promise.all(objetos.map((objeto, i) => prisma.tender.create({ data: licitacao(`fim-${i}`, objeto, 20 + i) })))
    const matches = await Promise.all(
      tenders.map((t: { id: string }) => prisma.tenderMatch.create({ data: { tenderId: t.id, monitoredItemId: item.id, companyId: user.companyId, userId: user.id, score: 0.8, matchedKeywords: [palavra] } }))
    )

    const { processarMatch } = await import('../../src/workers/notificador')
    const { enviarResumoDoUsuario } = await import('../../src/services/resumoDiario')
    const { sendMatchEmail, sendDocumentExpiryEmail, sendResumoDiarioEmail } = await import('../../src/services/emailService')
    const { caixaDeSaidaDeTeste } = await import('../../src/services/emailTransacional')
    const paraEle = () => caixaDeSaidaDeTeste.filter((m) => m.to === user.email)
    vi.mocked(sendMatchEmail).mockClear()

    await Promise.all(matches.map((m: { id: string }) => processarMatch({ tenderMatchId: m.id })))
    expect(vi.mocked(sendMatchEmail).mock.calls.filter(([p]) => p.to === user.email)).toHaveLength(0)
    expect(paraEle()).toHaveLength(1)
    const [aviso] = paraEle()
    expect(aviso.subject).toBe('Seu teste terminou: 3 licitações novas esperando por você')
    expect(aviso.link).toMatch(/\/acesso-encerrado$/)
    for (const objeto of objetos) expect(aviso.html).not.toContain(objeto)
    expect((await prisma.company.findUnique({ where: { id: user.companyId } }))!.avisoDoFimDoAcesso!.getTime()).toBe(ontem.getTime())

    const { processarLicitacaoNoMatcher } = await import('../../src/workers/matcher')
    const quarta = await prisma.tender.create({ data: licitacao('fim-3', `Fornecimento de ${palavra} quarta`, 25) })
    const [quartoMatch] = await processarLicitacaoNoMatcher(quarta.id)
    expect(quartoMatch).toBeTruthy()
    await processarMatch({ tenderMatchId: quartoMatch })
    expect(paraEle()).toHaveLength(1)
    expect(vi.mocked(sendMatchEmail).mock.calls.filter(([p]) => p.to === user.email)).toHaveLength(0)
    expect(await enviarResumoDoUsuario(user.id)).toBe('sem-acesso')

    const documento = await prisma.companyDocument.create({
      data: { companyId: user.companyId, userId: user.id, nome: `CND ${sufixo}`, dataValidade: new Date(Date.now() + 3 * DIA_MS) },
    })
    const { checkExpiringDocuments } = await import('../../src/services/documentAlertService')
    vi.mocked(sendDocumentExpiryEmail).mockClear()
    await checkExpiringDocuments()
    expect(vi.mocked(sendDocumentExpiryEmail).mock.calls.filter(([p]) => p.to === user.email)).toHaveLength(0)
    expect((await prisma.companyDocument.findUnique({ where: { id: documento.id } }))!.lastAlertedAt).toBeNull()

    await prisma.user.update({ where: { id: user.id }, data: { accessExpiresAt: new Date(Date.now() + 30 * DIA_MS) } })
    const quinta = await prisma.tender.create({ data: licitacao('fim-4', `Fornecimento de ${palavra} quinta`, 26) })
    const [quintoMatch] = await processarLicitacaoNoMatcher(quinta.id)
    await processarMatch({ tenderMatchId: quintoMatch })
    expect(vi.mocked(sendMatchEmail).mock.calls.filter(([p]) => p.to === user.email)).toHaveLength(0)
    vi.mocked(sendResumoDiarioEmail).mockClear()
    expect(await enviarResumoDoUsuario(user.id)).toBe('enviado')
    expect(vi.mocked(sendResumoDiarioEmail).mock.calls[0][1].map((l) => l.tenderId)).toContain(quinta.id)
    await checkExpiringDocuments()
    expect(vi.mocked(sendDocumentExpiryEmail).mock.calls.filter(([p]) => p.to === user.email)).toHaveLength(1)
  }, 60_000)
})
