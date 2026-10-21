import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lerJson(texto: string): any {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

rodar('LGPD: exclusão do membro, preferências de e-mail e retenção da auditoria', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  let tenderId = ''
  const sufixo = randomUUID().slice(0, 8)
  const email = (n: string) => `${n}-${sufixo}@teste.local`
  const SENHA = 'Senha-forte-123'

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'navegador-de-teste', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: res.status, body: lerJson(await res.text()) }
  }

  async function criarUsuario(nome: string, papel: 'OWNER' | 'MEMBER' = 'OWNER', companyId?: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: email(nome),
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: papel,
        ...(companyId ? { companyId } : { company: { create: { name: `Empresa ${nome} ${sufixo}`, tipo: 'PESSOA_JURIDICA' } } }),
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: email(nome), password: SENHA })).body.token
    return { userId: u.id as string, companyId: u.companyId as string, token: token as string }
  }

  async function semearDadosDoMembro(membro: { userId: string; companyId: string }) {
    const item = await prisma.monitoredItem.create({
      data: { companyId: membro.companyId, userId: membro.userId, name: 'Cimento', keywords: ['cimento'], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] },
    })
    await prisma.tenderMatch.create({ data: { tenderId, monitoredItemId: item.id, companyId: membro.companyId, userId: membro.userId, matchedKeywords: ['cimento'], score: 1 } })
    const documento = await prisma.companyDocument.create({ data: { companyId: membro.companyId, userId: membro.userId, nome: 'Certidão' } })
    const estudo = await prisma.costStudy.create({ data: { companyId: membro.companyId, userId: membro.userId, tenderId, dados: {} } })
    const plano = await prisma.tenderParticipationPlan.create({ data: { companyId: membro.companyId, userId: membro.userId, tenderId, state: {} } })
    await prisma.tenderChecklist.create({ data: { companyId: membro.companyId, userId: membro.userId, tenderId, items: [] } })
    const acompanhamento = await prisma.pregaoAcompanhamento.create({ data: { companyId: membro.companyId, tenderId } })
    const lance = await prisma.pregaoLance.create({ data: { acompanhamentoId: acompanhamento.id, alvo: 'item-1', origem: 'MEU_LANCE', valor: 10, userId: membro.userId } })
    await prisma.notification.create({ data: { userId: membro.userId, type: 'EMAIL', title: 't', body: 'b' } })
    await prisma.aiUsage.create({ data: { companyId: membro.companyId, userId: membro.userId, provider: 'teste', model: 'teste' } })
    await prisma.auditLog.create({
      data: { actorUserId: membro.userId, actorEmail: email('x'), companyId: membro.companyId, action: 'LOGIN_OK', ip: '10.0.0.1', userAgent: 'navegador' },
    })
    return { itemId: item.id as string, documentoId: documento.id as string, estudoId: estudo.id as string, planoId: plano.id as string, lanceId: lance.id as string }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste-com-tamanho-bom'
    process.env.RATE_LIMIT_DISABLED = 'true'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const tender = await prisma.tender.create({
      data: { fonte: 'PNCP', fonteId: `lgpd-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', objeto: 'Compra de cimento', rawJson: {}, encerramentoAt: new Date(Date.now() + 20 * 86_400_000) },
    })
    tenderId = tender.id
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  describe('membro exclui os próprios dados', () => {
    it('o usuário some, a empresa e os dados dela ficam com o dono e a auditoria fica anonimizada', async () => {
      const dono = await criarUsuario('dono-a')
      const membro = await criarUsuario('membro-a', 'MEMBER', dono.companyId)
      const semeado = await semearDadosDoMembro(membro)
      await prisma.auditLog.create({
        data: { actorUserId: dono.userId, companyId: dono.companyId, action: 'MEMBRO_CRIADO', entityType: 'usuario', entityId: membro.userId, metadata: { email: email('membro-a'), papel: 'MEMBER' } },
      })

      expect((await http('POST', '/api/conta/excluir-meus-dados', { senha: 'senha-errada-123' }, membro.token)).status).toBe(400)
      expect(await prisma.user.count({ where: { id: membro.userId } })).toBe(1)

      const r = await http('POST', '/api/conta/excluir-meus-dados', { senha: SENHA }, membro.token)
      expect(r.status).toBe(200)

      expect(await prisma.user.count({ where: { id: membro.userId } })).toBe(0)
      expect(await prisma.company.count({ where: { id: dono.companyId } })).toBe(1)
      expect((await prisma.monitoredItem.findUnique({ where: { id: semeado.itemId } })).userId).toBe(dono.userId)
      expect((await prisma.companyDocument.findUnique({ where: { id: semeado.documentoId } })).userId).toBe(dono.userId)
      expect((await prisma.costStudy.findUnique({ where: { id: semeado.estudoId } })).userId).toBe(dono.userId)
      expect((await prisma.tenderParticipationPlan.findUnique({ where: { id: semeado.planoId } })).userId).toBe(dono.userId)
      expect(await prisma.tenderMatch.count({ where: { monitoredItemId: semeado.itemId, userId: dono.userId } })).toBe(1)
      expect(await prisma.tenderChecklist.count({ where: { companyId: dono.companyId, userId: dono.userId } })).toBe(1)
      expect((await prisma.pregaoLance.findUnique({ where: { id: semeado.lanceId } })).userId).toBeNull()
      expect(await prisma.notification.count({ where: { userId: membro.userId } })).toBe(0)
      expect(await prisma.aiUsage.count({ where: { userId: membro.userId } })).toBe(0)
      expect(await prisma.aiUsage.count({ where: { companyId: dono.companyId } })).toBe(1)

      expect(await prisma.auditLog.count({ where: { actorUserId: membro.userId } })).toBe(0)
      expect(await prisma.auditLog.count({ where: { actorEmail: email('membro-a') } })).toBe(0)
      const doLogin = await prisma.auditLog.findFirst({ where: { companyId: dono.companyId, action: 'LOGIN_OK', actorUserId: null } })
      expect(doLogin).toMatchObject({ actorEmail: null, ip: null, userAgent: null })
      const convite = await prisma.auditLog.findFirst({ where: { action: 'MEMBRO_CRIADO', entityId: membro.userId } })
      expect(convite.metadata).toEqual({ papel: 'MEMBER' })
      const registro = await prisma.auditLog.findFirst({ where: { action: 'DADOS_PROPRIOS_EXCLUIDOS', entityId: membro.userId } })
      expect(registro).toMatchObject({ actorUserId: null, actorEmail: null, ip: null, userAgent: null, companyId: dono.companyId })
      expect(registro.metadata).toMatchObject({ dadosDaEmpresaReatribuidosA: dono.userId, itensMonitorados: 1 })

      expect((await http('POST', '/api/auth/login', { email: email('membro-a'), password: SENHA })).status).toBe(401)
    })

    it('o dono que é o último dono não usa a rota de membro; com outro dono ativo, pode', async () => {
      const dono = await criarUsuario('dono-b')
      await criarUsuario('membro-b', 'MEMBER', dono.companyId)
      expect((await http('GET', '/api/conta/opcoes-de-exclusao', undefined, dono.token)).body).toEqual({
        papel: 'OWNER',
        podeExcluirSoOsMeusDados: false,
        podePedirExclusaoDaEmpresa: true,
      })
      const recusado = await http('POST', '/api/conta/excluir-meus-dados', { senha: SENHA }, dono.token)
      expect(recusado.status).toBe(409)
      expect(await prisma.user.count({ where: { id: dono.userId } })).toBe(1)

      const outroDono = await criarUsuario('dono-b2', 'OWNER', dono.companyId)
      expect((await http('GET', '/api/conta/opcoes-de-exclusao', undefined, dono.token)).body.podeExcluirSoOsMeusDados).toBe(true)
      expect((await http('POST', '/api/conta/excluir-meus-dados', { senha: SENHA }, dono.token)).status).toBe(200)
      expect(await prisma.user.count({ where: { id: dono.userId } })).toBe(0)
      expect(await prisma.user.count({ where: { id: outroDono.userId } })).toBe(1)
    })
  })

  describe('dono remove membro', () => {
    it('remove de verdade, reatribui os dados ao dono e registra na auditoria', async () => {
      const dono = await criarUsuario('dono-c')
      const membro = await criarUsuario('membro-c', 'MEMBER', dono.companyId)
      const semeado = await semearDadosDoMembro(membro)

      expect((await http('DELETE', `/api/company/members/${dono.userId}`, undefined, dono.token)).status).toBe(400)
      expect((await http('DELETE', `/api/company/members/${dono.userId}`, undefined, membro.token)).status).toBe(403)

      expect((await http('DELETE', `/api/company/members/${membro.userId}`, undefined, dono.token)).status).toBe(204)
      expect(await prisma.user.count({ where: { id: membro.userId } })).toBe(0)
      expect((await prisma.monitoredItem.findUnique({ where: { id: semeado.itemId } })).userId).toBe(dono.userId)
      expect(await prisma.auditLog.count({ where: { actorUserId: membro.userId } })).toBe(0)
      const registro = await prisma.auditLog.findFirst({ where: { action: 'MEMBRO_REMOVIDO', entityId: membro.userId } })
      expect(registro).toMatchObject({ actorUserId: dono.userId, companyId: dono.companyId })
      expect(JSON.stringify(registro.metadata)).not.toContain(email('membro-c'))

      expect((await http('DELETE', `/api/company/members/${membro.userId}`, undefined, dono.token)).status).toBe(404)
    })

    it('outra empresa não consegue remover membro alheio', async () => {
      const dono = await criarUsuario('dono-d')
      const membro = await criarUsuario('membro-d', 'MEMBER', dono.companyId)
      const intruso = await criarUsuario('intruso-d')
      expect((await http('DELETE', `/api/company/members/${membro.userId}`, undefined, intruso.token)).status).toBe(404)
      expect(await prisma.user.count({ where: { id: membro.userId } })).toBe(1)
    })
  })

  describe('preferências e descadastro', () => {
    it('a tela lê e grava as preferências do próprio usuário', async () => {
      const dono = await criarUsuario('prefs')
      const lidas = await http('GET', '/api/conta/preferencias-de-email', undefined, dono.token)
      expect(lidas.body.preferencias).toEqual({ 'resumo-diario': true, 'lembrete-de-prazo': true, 'aviso-de-documento': true, 'aviso-de-alteracao': true })
      const gravadas = await http('PATCH', '/api/conta/preferencias-de-email', { 'aviso-de-documento': false }, dono.token)
      expect(gravadas.body.preferencias['aviso-de-documento']).toBe(false)
      expect((await http('PATCH', '/api/conta/preferencias-de-email', { propaganda: false }, dono.token)).status).toBe(400)
      expect((await http('PATCH', '/api/conta/preferencias-de-email', { 'resumo-diario': 'nao' }, dono.token)).status).toBe(400)
      expect(await prisma.auditLog.count({ where: { action: 'PREFERENCIAS_DE_EMAIL_ALTERADAS', entityId: dono.userId } })).toBe(1)
    })

    it('o GET do link não desliga; o POST desliga só o tipo do token; token adulterado é recusado', async () => {
      const { tokenDeDescadastro } = await import('../../src/lib/descadastro')
      const dono = await criarUsuario('descadastro')
      const token = tokenDeDescadastro(dono.userId, 'lembrete-de-prazo')!

      const consulta = await http('GET', `/api/descadastro?t=${encodeURIComponent(token)}`)
      expect(consulta.status).toBe(200)
      expect(consulta.body).toMatchObject({ tipo: 'lembrete-de-prazo', recebendo: true })
      expect((await prisma.user.findUnique({ where: { id: dono.userId } })).receberLembreteDePrazo).toBe(true)

      const confirmado = await http('POST', '/api/descadastro', { t: token })
      expect(confirmado.status).toBe(200)
      const depois = await prisma.user.findUnique({ where: { id: dono.userId } })
      expect(depois).toMatchObject({ receberLembreteDePrazo: false, receberResumoDiario: true, receberAvisoDeDocumento: true, receberAvisoDeAlteracao: true })
      expect(await prisma.auditLog.count({ where: { action: 'DESCADASTRO_POR_LINK', entityId: dono.userId } })).toBe(1)

      const adulterado = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA')
      expect((await http('POST', '/api/descadastro', { t: `x${adulterado}` })).status).toBe(400)
      expect((await http('GET', '/api/descadastro')).status).toBe(400)
    })

    it('o POST de um clique (RFC 8058) desliga direto, com o corpo de formulário', async () => {
      const { tokenDeDescadastro } = await import('../../src/lib/descadastro')
      const dono = await criarUsuario('umclique')
      const token = tokenDeDescadastro(dono.userId, 'resumo-diario')!
      const res = await fetch(`${base}/api/descadastro/um-clique?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      })
      expect(res.status).toBe(200)
      expect((await prisma.user.findUnique({ where: { id: dono.userId } })).receberResumoDiario).toBe(false)
    })
  })

  describe('retenção da auditoria', () => {
    it('registros com mais de 5 anos ficam sem e-mail, IP e navegador; os recentes não mudam e nada é apagado', async () => {
      const { anonimizarAuditoriaAntiga } = await import('../../src/services/retentionService')
      const agora = new Date()
      const antigo = await prisma.auditLog.create({
        data: {
          actorUserId: 'ator-antigo',
          actorEmail: email('antigo'),
          action: 'LOGIN_OK',
          ip: '10.0.0.9',
          userAgent: 'navegador antigo',
          metadata: { email: email('antigo'), motivo: 'teste' },
          createdAt: new Date(agora.getTime() - (5 * 365 + 3) * 86_400_000),
        },
      })
      const recente = await prisma.auditLog.create({
        data: { actorEmail: email('recente'), action: 'LOGIN_OK', ip: '10.0.0.8', userAgent: 'navegador novo', createdAt: new Date(agora.getTime() - 4 * 365 * 86_400_000) },
      })

      const { anonimizados } = await anonimizarAuditoriaAntiga(agora)
      expect(anonimizados).toBeGreaterThanOrEqual(1)

      const antigoDepois = await prisma.auditLog.findUnique({ where: { id: antigo.id } })
      expect(antigoDepois).toMatchObject({ actorEmail: null, ip: null, userAgent: null, actorUserId: 'ator-antigo', action: 'LOGIN_OK' })
      expect(antigoDepois.metadata).toEqual({ motivo: 'teste' })
      expect(await prisma.auditLog.findUnique({ where: { id: recente.id } })).toMatchObject({ actorEmail: email('recente'), ip: '10.0.0.8' })

      expect((await anonimizarAuditoriaAntiga(agora)).anonimizados).toBe(0)
    })
  })
})
