// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): direitos do titular
// (exportação e exclusão), trava do CPF/CNPJ da empresa e barreiras do cadastro.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

function gerarCnpj(): string {
  const d = [...Array.from({ length: 8 }, () => randomInt(0, 10)), 0, 0, 0, 1]
  for (const tam of [12, 13]) {
    const pesos = tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < tam; i++) soma += d[i] * pesos[i]
    const r = soma % 11
    d.push(r < 2 ? 0 : 11 - r)
  }
  return d.join('')
}

rodar('Conta: LGPD, documento da empresa e cadastro', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const email = (n: string) => `${n}-${sufixo}@teste.local`
  const SENHA = 'Senha-forte-123'

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* sem corpo */ }
    return { status: res.status, body, texto, headers: res.headers }
  }

  async function criarEmpresa(nome: string, cnpj: string | null, papel: 'OWNER' | 'MEMBER' = 'OWNER', companyId?: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: email(nome),
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: papel,
        ...(companyId ? { companyId } : { company: { create: { name: `Empresa ${nome} ${sufixo}`, tipo: 'PESSOA_JURIDICA', cnpj } } }),
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: email(nome), password: SENHA })).body.token
    return { userId: u.id as string, companyId: u.companyId as string, token: token as string }
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
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  describe('CPF/CNPJ da empresa', () => {
    it('o dono reenvia o mesmo documento (formatado ou não) sem erro, mas não troca', async () => {
      const cnpj = gerarCnpj()
      const { token } = await criarEmpresa('travado', cnpj)
      const formatado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
      expect((await http('PATCH', '/api/company', { name: 'Novo nome', tipo: 'PESSOA_JURIDICA', cnpj: formatado, cpf: null }, token)).status).toBe(200)
      const troca = await http('PATCH', '/api/company', { tipo: 'PESSOA_JURIDICA', cnpj: gerarCnpj() }, token)
      expect(troca.status).toBe(403)
      expect((await http('PATCH', '/api/company', { cnpj: null }, token)).status).toBe(403) // "soltar" o documento
      expect((await http('PATCH', '/api/company', { tipo: 'PESSOA_FISICA' }, token)).status).toBe(403)
    })

    it('empresa sem documento pode preenchê-lo uma vez, com validação; documento alheio dá mensagem neutra', async () => {
      const ocupado = gerarCnpj()
      await criarEmpresa('ocupante', ocupado)
      const { token } = await criarEmpresa('semdoc', null)
      expect((await http('PATCH', '/api/company', { tipo: 'PESSOA_JURIDICA', cnpj: '11111111111111' }, token)).status).toBe(400)
      const alheio = await http('PATCH', '/api/company', { tipo: 'PESSOA_JURIDICA', cnpj: ocupado }, token)
      expect(alheio.status).toBe(409)
      expect(alheio.body.error).not.toMatch(/cadastrad|existe/i)
      const proprio = gerarCnpj()
      expect((await http('PATCH', '/api/company', { tipo: 'PESSOA_JURIDICA', cnpj: proprio }, token)).status).toBe(200)
      expect((await http('PATCH', '/api/company', { tipo: 'PESSOA_JURIDICA', cnpj: gerarCnpj() }, token)).status).toBe(403)
    })
  })

  describe('LGPD', () => {
    it('exporta os dados da conta, sem hash de senha, e registra na auditoria', async () => {
      const { token, companyId, userId } = await criarEmpresa('exporta', gerarCnpj())
      await prisma.monitoredItem.create({ data: { companyId, userId, name: 'Notebooks', keywords: ['notebook'], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] } })
      const r = await http('GET', '/api/conta/meus-dados', undefined, token)
      expect(r.status).toBe(200)
      expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="meus-dados-/)
      expect(r.body.usuario.email).toBe(email('exporta'))
      expect(r.body.itensMonitorados).toHaveLength(1)
      expect(r.texto).not.toMatch(/passwordHash|tokenHash/)
      expect(await prisma.auditLog.count({ where: { companyId, action: 'DADOS_EXPORTADOS' } })).toBe(1)
    })

    it('membro não recebe a lista dos outros membros', async () => {
      const dono = await criarEmpresa('donoexp', gerarCnpj())
      const membro = await criarEmpresa('membroexp', null, 'MEMBER', dono.companyId)
      const r = await http('GET', '/api/conta/meus-dados', undefined, membro.token)
      expect(r.body.membros).toEqual([])
    })

    it('pedido de exclusão: só o dono, com a senha; fica na auditoria', async () => {
      const dono = await criarEmpresa('pedeexclusao', gerarCnpj())
      const membro = await criarEmpresa('membroexc', null, 'MEMBER', dono.companyId)
      expect((await http('POST', '/api/conta/solicitar-exclusao', { senha: SENHA }, membro.token)).status).toBe(403)
      expect((await http('POST', '/api/conta/solicitar-exclusao', { senha: 'errada-errada' }, dono.token)).status).toBe(400)
      expect((await http('POST', '/api/conta/solicitar-exclusao', { senha: SENHA, motivo: 'encerramos' }, dono.token)).status).toBe(202)
      expect(await prisma.auditLog.count({ where: { companyId: dono.companyId, action: 'EXCLUSAO_SOLICITADA' } })).toBe(1)
    })

    it('excluirEmpresa: simula, depois apaga tudo e anonimiza a auditoria; recusa empresa com admin', async () => {
      const { excluirEmpresa, ExclusaoRecusadaError } = await import('../../src/services/exclusaoDeEmpresa')
      const dono = await criarEmpresa('seraexcluida', gerarCnpj())
      await criarEmpresa('membroexcluido', null, 'MEMBER', dono.companyId)
      await prisma.monitoredItem.create({ data: { companyId: dono.companyId, userId: dono.userId, name: 'X', keywords: [], catmatCodes: [], catserCodes: [], ufs: [], modalidades: [], orgaos: [], uasgCodes: [] } })
      await prisma.companyDocument.create({ data: { companyId: dono.companyId, userId: dono.userId, nome: 'Certidão' } })
      await prisma.notification.create({ data: { userId: dono.userId, type: 'EMAIL', title: 't', body: 'b' } })

      const simulado = await excluirEmpresa(dono.companyId, false)
      expect(simulado).toMatchObject({ executada: false, usuarios: 2, itensMonitorados: 1, documentos: 1 })
      expect(await prisma.company.count({ where: { id: dono.companyId } })).toBe(1)

      const feito = await excluirEmpresa(dono.companyId, true)
      expect(feito.executada).toBe(true)
      expect(await prisma.company.count({ where: { id: dono.companyId } })).toBe(0)
      expect(await prisma.user.count({ where: { email: { in: [email('seraexcluida'), email('membroexcluido')] } } })).toBe(0)
      expect(await prisma.monitoredItem.count({ where: { companyId: dono.companyId } })).toBe(0)
      const trilha = await prisma.auditLog.findMany({ where: { companyId: dono.companyId } })
      expect(trilha.length).toBeGreaterThan(0)
      expect(trilha.every((e: { actorEmail: string | null; ip: string | null }) => e.actorEmail === null && e.ip === null)).toBe(true)
      expect(await prisma.auditLog.count({ where: { entityId: dono.companyId, action: 'EMPRESA_EXCLUIDA' } })).toBe(1)
      expect((await http('POST', '/api/auth/login', { email: email('seraexcluida'), password: SENHA })).status).toBe(401)

      const comAdmin = await criarEmpresa('temadmin', gerarCnpj())
      await prisma.user.update({ where: { id: comAdmin.userId }, data: { isAdmin: true } })
      await expect(excluirEmpresa(comAdmin.companyId, true)).rejects.toBeInstanceOf(ExclusaoRecusadaError)
    })
  })

  describe('cadastro', () => {
    it('e-mail descartável é recusado com mensagem clara', async () => {
      const r = await http('POST', '/api/auth/register', {
        nome: 'Robô', email: `x-${sufixo}@mailinator.com`, senha: SENHA, tipo: 'PESSOA_JURIDICA', documento: gerarCnpj(), aceiteTermos: true,
      })
      expect(r.status).toBe(400)
      expect(r.body.code).toBe('EMAIL_DESCARTAVEL')
    })
  })
})
