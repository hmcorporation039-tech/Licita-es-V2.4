// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): correções da auditoria de
// segurança — cota de IA com análises em andamento, rawJson fora das respostas, apagar matches só
// pelo dono, teto de documentos, campos da empresa e limites de entrada.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Auditoria de segurança: correções', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const futuro = new Date(Date.now() + 10 * 86_400_000)

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body, texto }
  }

  async function conta(nome: string, papel: 'OWNER' | 'MEMBER' = 'OWNER', companyId?: string, extraEmpresa: Record<string, unknown> = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${nome}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: papel,
        ...(companyId ? { companyId } : { company: { create: { name: `Empresa ${nome} ${sufixo}`, ...extraEmpresa } } }),
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string
    return { userId: u.id as string, companyId: u.companyId as string, token }
  }

  let dono: Awaited<ReturnType<typeof conta>>
  let membro: Awaited<ReturnType<typeof conta>>
  let tenderId = ''

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

    dono = await conta('seg-dono', 'OWNER', undefined, { quotaOverrides: { analisesIaMes: 3 } })
    membro = await conta('seg-membro', 'MEMBER', dono.companyId)
    const t = await prisma.tender.create({
      data: {
        fonte: 'FIEG', fonteId: `seg-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição segurança ${sufixo}`, objetoNorm: `aquisicao seguranca ${sufixo}`, encerramentoAt: futuro, publicadoAt: new Date(),
        rawJson: { segredoInterno: 'payload-bruto-do-coletor', cnpjFonte: '123' },
        items: { create: [{ numeroItem: 1, descricao: 'Item', quantidade: 1 }] },
      },
    })
    tenderId = t.id
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  describe('cota de IA conta as análises em andamento', () => {
    it('pedidos ainda PENDING/RUNNING entram na conta; concluídos e fora da janela não duplicam', async () => {
      const { analisesEmAndamento, pedidosDeAnaliseNaUltimaHora, usoDaEmpresa, JANELA_EM_ANDAMENTO_MS } = await import('../../src/services/quotaService')
      const mk = async (status: string, minutosAtras: number) => {
        const tender = await prisma.tender.create({
          data: { fonte: 'FIEG', fonteId: `seg-an-${randomUUID()}`, modalidade: 'CONVITE', objeto: 'x', rawJson: {}, analysis: { create: { status } } },
        })
        await prisma.auditLog.create({
          data: { companyId: dono.companyId, action: 'ANALISE_SOLICITADA', entityType: 'tender', entityId: tender.id, createdAt: new Date(Date.now() - minutosAtras * 60_000) },
        })
        return tender.id
      }
      await mk('PENDING', 1)
      await mk('RUNNING', 5)
      await mk('DONE', 2) // concluída: não é "em andamento" (o consumo dela entra por AiUsage)
      await mk('PENDING', JANELA_EM_ANDAMENTO_MS / 60_000 + 20) // pedido antigo e preso: fora da janela

      expect(await analisesEmAndamento(dono.companyId)).toBe(2)
      expect((await usoDaEmpresa(dono.companyId)).analisesIaMes).toBe(2)
      expect(await pedidosDeAnaliseNaUltimaHora(dono.companyId)).toBe(4) // todos os 4 pedidos são de menos de 1 hora (o de 50 min conta)
    })

    it('com o plano em 3 análises: duas em andamento ainda deixam pedir a terceira; a quarta é barrada (402)', async () => {
      const { exigirCota } = await import('../../src/services/quotaService')
      await expect(exigirCota(dono.companyId, 'analisesIaMes')).resolves.toBeUndefined() // 2 de 3
      const tender = await prisma.tender.create({ data: { fonte: 'FIEG', fonteId: `seg-an-${randomUUID()}`, modalidade: 'CONVITE', objeto: 'y', rawJson: {}, analysis: { create: { status: 'PENDING' } } } })
      await prisma.auditLog.create({ data: { companyId: dono.companyId, action: 'ANALISE_SOLICITADA', entityType: 'tender', entityId: tender.id } })
      await expect(exigirCota(dono.companyId, 'analisesIaMes')).rejects.toMatchObject({ status: 402 }) // 3 de 3: estourou
      await expect(exigirCota(dono.companyId, 'analisesIaMes', true)).resolves.toBeUndefined() // admin nunca é limitado
    })

    it('o teto por hora vale mesmo para análises que falharam', async () => {
      const { MAX_ANALISES_POR_HORA, pedidosDeAnaliseNaUltimaHora } = await import('../../src/services/quotaService')
      const outra = await conta('seg-hora')
      await prisma.auditLog.createMany({
        data: Array.from({ length: MAX_ANALISES_POR_HORA }, () => ({ companyId: outra.companyId, action: 'ANALISE_SOLICITADA', entityType: 'tender', entityId: randomUUID() })),
      })
      expect(await pedidosDeAnaliseNaUltimaHora(outra.companyId)).toBe(MAX_ANALISES_POR_HORA)
    })
  })

  describe('rawJson nunca vai ao cliente', () => {
    it('lista de licitações, detalhe, matches, dashboard e escolhidas não trazem rawJson nem o conteúdo dele', async () => {
      const item = await prisma.monitoredItem.create({
        data: { companyId: dono.companyId, userId: dono.userId, name: 'Item', keywords: ['seguranca'], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] },
      })
      await prisma.tenderMatch.create({ data: { tenderId, monitoredItemId: item.id, companyId: dono.companyId, userId: dono.userId, score: 0.8, matchedByCode: false, matchedKeywords: ['seguranca'] } })
      await http('PATCH', `/api/tenders/${tenderId}/plano/status`, { status: 'VOU_PARTICIPAR' }, dono.token)

      const respostas = {
        lista: await http('GET', `/api/tenders?q=${sufixo}`, undefined, dono.token),
        listaRelacionadas: await http('GET', `/api/tenders?q=${sufixo}&somenteRelacionadas=true`, undefined, dono.token),
        detalhe: await http('GET', `/api/tenders/${tenderId}`, undefined, dono.token),
        matches: await http('GET', '/api/matches', undefined, dono.token),
        matchesPorNota: await http('GET', '/api/matches?ordem=nota', undefined, dono.token),
        dashboard: await http('GET', '/api/dashboard', undefined, dono.token),
        escolhidas: await http('GET', '/api/participation-plans?status=VOU_PARTICIPAR', undefined, dono.token),
      }
      for (const [nome, r] of Object.entries(respostas)) {
        expect(r.status, nome).toBe(200)
        expect(r.texto, nome).not.toContain('rawJson')
        expect(r.texto, nome).not.toContain('payload-bruto-do-coletor')
      }
      // e o conteúdo útil continua lá
      expect(respostas.lista.body.items[0].objeto).toContain(sufixo)
      expect(respostas.detalhe.body.items).toHaveLength(1)
      expect(respostas.matches.body.items[0].tender.objeto).toContain(sufixo)
      expect(respostas.escolhidas.body[0].tender.objeto).toContain(sufixo)
    })
  })

  describe('permissões e limites de entrada', () => {
    it('só o dono apaga todos os matches, e isso fica na auditoria', async () => {
      expect((await http('DELETE', '/api/matches', undefined, membro.token)).status).toBe(403)
      expect(await prisma.tenderMatch.count({ where: { companyId: dono.companyId } })).toBeGreaterThan(0)
      const r = await http('DELETE', '/api/matches', undefined, dono.token)
      expect(r.status).toBe(200)
      expect(r.body.deleted).toBeGreaterThan(0)
      expect(await prisma.tenderMatch.count({ where: { companyId: dono.companyId } })).toBe(0)
      expect(await prisma.auditLog.count({ where: { companyId: dono.companyId, action: 'MATCHES_APAGADOS' } })).toBe(1)
    })

    it('GET /api/company não traz os ajustes comerciais (quotaOverrides), mas traz o necessário', async () => {
      const r = await http('GET', '/api/company', undefined, membro.token)
      expect(r.status).toBe(200)
      expect(r.texto).not.toContain('quotaOverrides')
      expect(r.body.name).toContain('Empresa seg-dono')
      expect(r.body.users).toHaveLength(2)
      expect(r.body.users[0]).not.toHaveProperty('passwordHash')
    })

    it('teto de documentos por empresa', async () => {
      const outra = await conta('seg-docs')
      await prisma.companyDocument.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ companyId: outra.companyId, userId: outra.userId, nome: `Doc ${i}` })) })
      const r = await http('POST', '/api/company-documents', { nome: 'Mais um' }, outra.token)
      expect(r.status).toBe(422)
      expect(r.body.error).toMatch(/Limite de 300 documentos/)
    })

    it('checklist com itens demais é recusado; /uasg/by-codes limita a lista', async () => {
      const item = { id: 'a', section: 's', label: 'l', checked: false, custom: false }
      const demais = await http('PUT', `/api/tenders/${tenderId}/checklist`, { items: Array.from({ length: 301 }, (_, i) => ({ ...item, id: `i${i}` })) }, dono.token)
      expect(demais.status).toBe(400)
      expect((await http('GET', `/api/uasg/by-codes?codes=${'1,'.repeat(1500)}`, undefined, dono.token)).status).toBe(400) // > 2000 caracteres
      expect((await http('GET', '/api/uasg/by-codes?codes=1,2,3', undefined, dono.token)).status).toBe(200)
    })
  })
})
