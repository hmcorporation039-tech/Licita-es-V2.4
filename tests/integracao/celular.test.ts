import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('web-push', async (original) => ({
  ...(await original<typeof import('web-push')>()),
  sendNotification: vi.fn(async () => ({ statusCode: 201, body: '', headers: {} })),
}))

vi.mock('../../src/services/emailService', async (original) => ({
  ...(await original<typeof import('../../src/services/emailService')>()),
  sendLembreteDePrazoEmail: vi.fn(async () => true),
  sendTenderChangedEmail: vi.fn(async () => undefined),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)
const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS

rodar('Notificações no celular', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let webpush: typeof import('web-push')
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `cel-${sufixo}-`
  const SENHA = 'Senha-forte-123'
  const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${prefixo}${n}`
  const chaves = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { body = null }
    return { status: res.status, body }
  }

  async function conta(nome: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Celular ${sufixo} ${nome}` } },
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string
    return { id: u.id as string, companyId: u.companyId as string, token }
  }

  const licitacao = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `${prefixo}${nome}`,
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto: `Aquisição de ${nome}`,
        objetoNorm: `aquisicao de ${nome}`,
        orgao: 'Prefeitura de Goiânia',
        uf: 'GO',
        rawJson: {},
        publicadoAt: new Date(Date.now() - HORA_MS),
        encerramentoAt: new Date(Date.now() + 10 * DIA_MS),
        ...extra,
      },
    })

  async function casar(user: { id: string; companyId: string }, tenderId: string, extra: Record<string, unknown> = {}) {
    const item = await prisma.monitoredItem.create({ data: { name: `Item ${randomUUID().slice(0, 6)}`, keywords: ['x'], companyId: user.companyId, userId: user.id } })
    return prisma.tenderMatch.create({ data: { tenderId, monitoredItemId: item.id, companyId: user.companyId, userId: user.id, score: 0.8, matchedKeywords: ['x'], ...extra } })
  }

  const enviados = () => vi.mocked(webpush.sendNotification).mock.calls.map(([inscricao, corpo]) => ({ endpoint: inscricao.endpoint, ...JSON.parse(String(corpo)) }))

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    webpush = await import('web-push')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockClear()
  })

  afterAll(async () => {
    const usuarios = { email: { startsWith: prefixo } }
    await prisma.notification.deleteMany({ where: { user: usuarios } })
    await prisma.tenderParticipationPlan.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tenderMatch.deleteMany({ where: { tender: { fonteId: { startsWith: prefixo } } } })
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    await prisma.monitoredItem.deleteMany({ where: { user: usuarios } })
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Celular ${sufixo}` } }, select: { id: true } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: empresas.map((e: { id: string }) => e.id) } } })
    await prisma.user.deleteMany({ where: usuarios })
    await prisma.company.deleteMany({ where: { name: { startsWith: `Celular ${sufixo}` } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  describe('ativar e desativar aparelhos', () => {
    it('ativa, reativa sem duplicar, testa, lista e exporta sem as chaves', async () => {
      const ana = await conta('ana')
      expect((await http('GET', '/api/celular', undefined, ana.token)).body).toMatchObject({ disponivel: true, aparelhos: [] })

      expect((await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('ana'), keys: chaves }, ana.token)).status).toBe(201)
      expect((await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('ana'), keys: chaves, expirationTime: null }, ana.token)).status).toBe(200)
      const situacao = (await http('GET', '/api/celular', undefined, ana.token)).body
      expect(situacao.aparelhos).toHaveLength(1)
      expect(situacao.aparelhos[0].aparelho).toBe('Android · Chrome')

      const teste = await http('POST', '/api/celular/teste', undefined, ana.token)
      expect(teste.body).toMatchObject({ aparelhos: 1, entregues: 1 })
      expect(enviados()[0]).toMatchObject({ endpoint: endpoint('ana'), titulo: 'Notificações ativadas' })

      const exportado = (await http('GET', '/api/conta/meus-dados', undefined, ana.token)).body
      expect(exportado.usuario.pushSubscriptions).toHaveLength(1)
      expect(JSON.stringify(exportado)).not.toContain(chaves.p256dh)

      expect((await http('DELETE', '/api/celular/aparelhos', { endpoint: endpoint('ana') }, ana.token)).status).toBe(204)
      expect(await prisma.pushSubscription.count({ where: { userId: ana.id } })).toBe(0)
      expect((await http('POST', '/api/celular/teste', undefined, ana.token)).status).toBe(409)
    })

    it('recusa endereço fora dos serviços de entrega dos navegadores', async () => {
      const bia = await conta('bia')
      for (const invalido of ['https://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'https://exemplo.com.br/push']) {
        expect((await http('POST', '/api/celular/aparelhos', { endpoint: invalido, keys: chaves }, bia.token)).status).toBe(400)
      }
      expect(await prisma.pushSubscription.count({ where: { userId: bia.id } })).toBe(0)
    })

    it('uma empresa não remove o aparelho de outra; o aparelho passa para quem entrou nele', async () => {
      const caio = await conta('caio')
      const dani = await conta('dani')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('compartilhado'), keys: chaves }, caio.token)
      const doCaio = await prisma.pushSubscription.findUnique({ where: { endpoint: endpoint('compartilhado') } })

      expect((await http('DELETE', '/api/celular/aparelhos', { id: doCaio.id }, dani.token)).status).toBe(204)
      expect(await prisma.pushSubscription.count({ where: { id: doCaio.id } })).toBe(1)

      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('compartilhado'), keys: chaves }, dani.token)
      expect((await prisma.pushSubscription.findUnique({ where: { endpoint: endpoint('compartilhado') } })).userId).toBe(dani.id)
      expect((await http('GET', '/api/celular', undefined, caio.token)).body.aparelhos).toHaveLength(0)
    })

    it('guarda no máximo 10 aparelhos por usuário, ficando com os mais novos', async () => {
      const edu = await conta('edu')
      for (let n = 0; n < 12; n++) await http('POST', '/api/celular/aparelhos', { endpoint: endpoint(`edu-${n}`), keys: chaves }, edu.token)
      const guardados = await prisma.pushSubscription.findMany({ where: { userId: edu.id }, select: { endpoint: true } })
      expect(guardados).toHaveLength(10)
      expect(guardados.map((g: { endpoint: string }) => g.endpoint)).not.toContain(endpoint('edu-0'))
    })

    it('o aparelho que saiu do ar é apagado na primeira entrega recusada', async () => {
      const fabi = await conta('fabi')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('fabi'), keys: chaves }, fabi.token)
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new webpush.WebPushError('Gone', 410, {}, '', endpoint('fabi')))
      expect((await http('POST', '/api/celular/teste', undefined, fabi.token)).body).toMatchObject({ aparelhos: 1, entregues: 0, removidos: 1 })
      expect(await prisma.pushSubscription.count({ where: { userId: fabi.id } })).toBe(0)
    })

    it('salva as preferências por tipo de aviso', async () => {
      const gui = await conta('gui')
      const r = await http('PATCH', '/api/celular/preferencias', { 'novas-licitacoes': false }, gui.token)
      expect(r.body.preferencias).toEqual({ 'novas-licitacoes': false, 'lembrete-de-prazo': true, 'aviso-de-alteracao': true })
      expect((await http('PATCH', '/api/celular/preferencias', { 'resumo-diario': false }, gui.token)).status).toBe(400)
    })

    it('a exclusão do usuário leva junto os aparelhos', async () => {
      const hugo = await conta('hugo')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('hugo'), keys: chaves }, hugo.token)
      await prisma.user.delete({ where: { id: hugo.id } })
      expect(await prisma.pushSubscription.count({ where: { endpoint: endpoint('hugo') } })).toBe(0)
    })
  })

  describe('licitações novas', () => {
    it('agrupa as licitações novas num aviso só e não repete', async () => {
      const { avisarNovasLicitacoesNoCelular } = await import('../../src/services/notificacaoNoCelular')
      const ines = await conta('ines')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('ines'), keys: chaves }, ines.token)

      const a = await licitacao('esquadrias-a')
      const b = await licitacao('esquadrias-b')
      const obra = await licitacao('obra-completa')
      const antiga = await licitacao('antiga', { createdAt: new Date(Date.now() - 5 * DIA_MS) })
      await casar(ines, a.id)
      await casar(ines, b.id)
      await casar(ines, obra.id, { dentroDeObraCompleta: true })
      await casar(ines, antiga.id)

      expect(await avisarNovasLicitacoesNoCelular(ines.id)).toBe('enviado')
      expect(enviados()).toHaveLength(1)
      expect(enviados()[0]).toMatchObject({ titulo: '2 licitações novas para você', url: '/matches', tag: 'novas-licitacoes' })

      expect(await avisarNovasLicitacoesNoCelular(ines.id)).toBe('sem-novidade')
      expect(enviados()).toHaveLength(1)

      const c = await licitacao('esquadrias-c')
      await casar(ines, c.id)
      expect(await avisarNovasLicitacoesNoCelular(ines.id, new Date(Date.now() + 1000))).toBe('enviado')
      expect(enviados()[1]).toMatchObject({ titulo: 'Licitação nova para você', url: `/tenders/${c.id}` })
    })

    it('respeita a preferência desligada', async () => {
      const { avisarNovasLicitacoesNoCelular } = await import('../../src/services/notificacaoNoCelular')
      const joao = await conta('joao')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('joao'), keys: chaves }, joao.token)
      await http('PATCH', '/api/celular/preferencias', { 'novas-licitacoes': false }, joao.token)
      await casar(joao, (await licitacao('desligada')).id)
      expect(await avisarNovasLicitacoesNoCelular(joao.id)).toBe('desligado')
      expect(enviados()).toHaveLength(0)
    })
  })

  describe('lembrete de prazo', () => {
    it('avisa no celular uma vez por marco, mesmo com o e-mail desligado', async () => {
      const { enviarLembretesDaEmpresa } = await import('../../src/services/lembreteDePrazo')
      const lia = await conta('lia')
      await prisma.user.update({ where: { id: lia.id }, data: { receberLembreteDePrazo: false } })
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('lia'), keys: chaves }, lia.token)
      const agora = new Date()
      const t = await licitacao('prazo', { encerramentoAt: new Date(agora.getTime() + 20 * HORA_MS) })
      await prisma.tenderParticipationPlan.create({ data: { companyId: lia.companyId, userId: lia.id, tenderId: t.id, status: 'VOU_PARTICIPAR', state: {} } })

      expect(await enviarLembretesDaEmpresa(lia.companyId, agora)).toEqual({ enviados: 0, falhas: 0, noCelular: 1 })
      expect(enviados()[0]).toMatchObject({ titulo: 'Faltam 20 horas para o fim do prazo', url: `/tenders/${t.id}` })
      expect(await enviarLembretesDaEmpresa(lia.companyId, new Date(agora.getTime() + HORA_MS))).toEqual({ enviados: 0, falhas: 0, noCelular: 0 })
      expect(enviados()).toHaveLength(1)
    })
  })

  describe('licitação alterada', () => {
    it('avisa no celular e não repete a mesma alteração', async () => {
      const { processarAlteracao } = await import('../../src/workers/notificador')
      const mel = await conta('mel')
      await http('POST', '/api/celular/aparelhos', { endpoint: endpoint('mel'), keys: chaves }, mel.token)
      const t = await licitacao('alterada')
      await processarAlteracao({ tipo: 'alteracao', tenderId: t.id, userId: mel.id, campos: ['encerramentoAt'] })
      await processarAlteracao({ tipo: 'alteracao', tenderId: t.id, userId: mel.id, campos: ['encerramentoAt'] })
      expect(enviados()).toHaveLength(1)
      expect(enviados()[0]).toMatchObject({ titulo: 'Licitação alterada pelo órgão', corpo: 'Fim do recebimento de propostas: Aquisição de alterada' })
    })
  })
})
