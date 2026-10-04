// ============================================================
// Teste de integração do cadastro público, confirmação de e-mail e
// recuperação de senha, com PostgreSQL real. Só roda com TEST_DATABASE_URL
// (ver o cabeçalho de api.test.ts). Nenhum e-mail sai: em teste as mensagens
// ficam em `caixaDeSaidaDeTeste`.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

// CPF/CNPJ válidos e únicos por execução (o documento é único no banco).
function gerarCpf(): string {
  const d = Array.from({ length: 9 }, () => randomInt(0, 10))
  for (const tam of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tam; i++) soma += d[i] * (tam + 1 - i)
    d.push(((soma * 10) % 11) % 10)
  }
  return d.join('')
}
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

rodar('Cadastro público e recuperação de senha', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caixa: any[]
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
    return { status: res.status, body, texto }
  }

  const cadastro = (extra: Record<string, unknown> = {}) => ({
    nome: 'Fulano de Tal',
    email: email('fulano'),
    senha: SENHA,
    tipo: 'PESSOA_FISICA',
    documento: gerarCpf(),
    aceiteTermos: true,
    ...extra,
  })

  const ultimoEmailPara = (para: string) => [...caixa].reverse().find((m) => m.to === para)
  const tokenDoLink = (link: string) => new URL(link).searchParams.get('token') as string

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.APP_URL = 'https://site.teste'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ caixaDeSaidaDeTeste: caixa } = await import('../../src/services/emailTransacional'))
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

  // -----------------------------------------------------------------
  describe('cadastro e confirmação de e-mail', () => {
    let tokenConfirmacao = ''
    let bodyPrimeiroCadastro = ''

    it('cria conta de teste (14 dias), plano TESTE, termos registrados — e responde 202', async () => {
      const r = await http('POST', '/api/auth/register', cadastro())
      expect(r.status).toBe(202)
      bodyPrimeiroCadastro = r.texto

      const user = await prisma.user.findUnique({ where: { email: email('fulano') }, include: { company: true } })
      expect(user).not.toBeNull()
      expect(user.emailVerifiedAt).toBeNull()
      expect(user.companyRole).toBe('OWNER')
      expect(user.termsVersion).toMatch(/minuta/)
      expect(user.termsAcceptedAt).not.toBeNull()
      expect(user.company.planCode).toBe('TESTE')
      expect(user.company.tipo).toBe('PESSOA_FISICA')
      const dias = (user.accessExpiresAt.getTime() - Date.now()) / 86_400_000
      expect(dias).toBeGreaterThan(13.9)
      expect(dias).toBeLessThan(14.1)
    })

    it('envia o e-mail de confirmação; no banco fica só o HASH do token', async () => {
      const msg = ultimoEmailPara(email('fulano'))
      expect(msg.subject).toMatch(/Confirme/)
      expect(msg.link).toMatch(/^https:\/\/site\.teste\/verificar-email\?token=/)
      tokenConfirmacao = tokenDoLink(msg.link)

      const tokens = await prisma.authToken.findMany({ where: { user: { email: email('fulano') } } })
      expect(tokens).toHaveLength(1)
      expect(tokens[0].tokenHash).not.toContain(tokenConfirmacao)
      expect(tokens[0].type).toBe('EMAIL_VERIFY')
    })

    it('antes de confirmar: senha certa é recusada com código estável; senha errada continua 401', async () => {
      const certa = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      expect(certa.status).toBe(403)
      expect(certa.body.code).toBe('EMAIL_NAO_VERIFICADO')
      const errada = await http('POST', '/api/auth/login', { email: email('fulano'), password: 'errada-errada-1' })
      expect(errada.status).toBe(401)
    })

    it('token inválido, truncado ou de outro tipo é recusado', async () => {
      expect((await http('POST', '/api/auth/verify-email', { token: 'x'.repeat(43) })).status).toBe(400)
      expect((await http('POST', '/api/auth/verify-email', { token: 'curto' })).status).toBe(400)
      expect((await http('POST', '/api/auth/reset-password', { token: tokenConfirmacao, novaSenha: 'Outra-senha-123' })).status).toBe(400)
    })

    it('confirma o e-mail uma vez; reusar o link falha; depois o login funciona', async () => {
      expect((await http('POST', '/api/auth/verify-email', { token: tokenConfirmacao })).status).toBe(200)
      expect((await http('POST', '/api/auth/verify-email', { token: tokenConfirmacao })).status).toBe(400)
      const login = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      expect(login.status).toBe(200)
      expect(login.body.token).toBeTruthy()
    })

    it('e-mail já cadastrado: MESMA resposta, nenhuma conta nova, dono é avisado', async () => {
      const antes = caixa.length
      const r = await http('POST', '/api/auth/register', cadastro({ documento: gerarCpf() }))
      expect(r.status).toBe(202)
      expect(r.texto).toBe(bodyPrimeiroCadastro) // indistinguível do cadastro novo
      expect(await prisma.user.count({ where: { email: email('fulano') } })).toBe(1)
      const aviso = caixa.slice(antes).find((m) => m.to === email('fulano'))
      expect(aviso.subject).toMatch(/Tentativa de cadastro/)
    })

    it('documento já usado em outro cadastro: mesma resposta e nenhum segundo teste gratuito', async () => {
      const doc = gerarCpf()
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('pessoa1'), documento: doc }))).status).toBe(202)
      const r = await http('POST', '/api/auth/register', cadastro({ email: email('pessoa2'), documento: doc }))
      expect(r.status).toBe(202)
      expect(r.texto).toBe(bodyPrimeiroCadastro)
      expect(await prisma.user.count({ where: { email: email('pessoa2') } })).toBe(0)
      // a máscara não é brecha: o mesmo CPF formatado também é barrado
      const mascarado = `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`
      await http('POST', '/api/auth/register', cadastro({ email: email('pessoa3'), documento: mascarado }))
      expect(await prisma.user.count({ where: { email: email('pessoa3') } })).toBe(0)
    })

    it('pessoa jurídica usa CNPJ e o nome da empresa', async () => {
      const r = await http('POST', '/api/auth/register', cadastro({ email: email('pj'), tipo: 'PESSOA_JURIDICA', documento: gerarCnpj(), empresaNome: 'Construtora Exemplo Ltda' }))
      expect(r.status).toBe(202)
      const u = await prisma.user.findUnique({ where: { email: email('pj') }, include: { company: true } })
      expect(u.company.name).toBe('Construtora Exemplo Ltda')
      expect(u.company.cnpj).toMatch(/^\d{14}$/)
      expect(u.company.cpf).toBeNull()
    })

    it('recusa dados inválidos: CPF/CNPJ errado, tipo trocado, senha fraca, sem aceite dos termos', async () => {
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('x1'), documento: '111.111.111-11' }))).status).toBe(400)
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('x2'), tipo: 'PESSOA_JURIDICA', documento: gerarCpf() }))).status).toBe(400)
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('x3'), senha: 'curta' }))).status).toBe(400)
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('x4'), aceiteTermos: false }))).status).toBe(400)
      expect((await http('POST', '/api/auth/register', { ...cadastro({ email: email('x5') }), aceiteTermos: undefined })).status).toBe(400)
      expect((await http('POST', '/api/auth/register', cadastro({ email: 'nao-e-email' }))).status).toBe(400)
      for (const n of ['x1', 'x2', 'x3', 'x4', 'x5']) expect(await prisma.user.count({ where: { email: email(n) } })).toBe(0)
    })

    it('campo-isca (honeypot) preenchido: finge sucesso e não cria nada', async () => {
      const r = await http('POST', '/api/auth/register', cadastro({ email: email('robo'), website: 'http://spam.example' }))
      expect(r.status).toBe(202)
      expect(await prisma.user.count({ where: { email: email('robo') } })).toBe(0)
    })

    it('reenviar confirmação: respeita o intervalo, invalida o link antigo e ignora conta já confirmada', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('reenvio') }))
      const primeiro = tokenDoLink(ultimoEmailPara(email('reenvio')).link)

      // dentro de 1 minuto: não manda outro
      const n = caixa.length
      expect((await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })).status).toBe(202)
      expect(caixa.length).toBe(n)

      // passado o intervalo: manda novo e o antigo morre
      await prisma.authToken.updateMany({ where: { user: { email: email('reenvio') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      expect((await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })).status).toBe(202)
      expect(caixa.length).toBe(n + 1)
      const segundo = tokenDoLink(ultimoEmailPara(email('reenvio')).link)
      expect(segundo).not.toBe(primeiro)
      expect((await http('POST', '/api/auth/verify-email', { token: primeiro })).status).toBe(400)
      expect((await http('POST', '/api/auth/verify-email', { token: segundo })).status).toBe(200)

      // conta já confirmada e e-mail inexistente: mesma resposta, nada enviado
      const m = caixa.length
      const a = await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })
      const b = await http('POST', '/api/auth/resend-verification', { email: email('naoexiste') })
      expect(a.status).toBe(202)
      expect(a.texto).toBe(b.texto)
      expect(caixa.length).toBe(m)
    })

    it('link de confirmação vencido (48 h) não funciona', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('vencido') }))
      const t = tokenDoLink(ultimoEmailPara(email('vencido')).link)
      await prisma.authToken.updateMany({ where: { user: { email: email('vencido') } }, data: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await http('POST', '/api/auth/verify-email', { token: t })).status).toBe(400)
    })

    it('teste vencido: login recusado com código ACESSO_EXPIRADO', async () => {
      await prisma.user.update({ where: { email: email('fulano') }, data: { accessExpiresAt: new Date(Date.now() - 1000) } })
      const r = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      expect(r.status).toBe(403)
      expect(r.body.code).toBe('ACESSO_EXPIRADO')
      await prisma.user.update({ where: { email: email('fulano') }, data: { accessExpiresAt: null } })
    })
  })

  // -----------------------------------------------------------------
  describe('recuperação de senha', () => {
    const NOVA = 'Nova-senha-forte-456'
    let sessaoAntiga = ''

    it('e-mail existente e inexistente recebem a MESMA resposta; só o existente recebe o link', async () => {
      const login = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      sessaoAntiga = login.body.token

      const n = caixa.length
      const a = await http('POST', '/api/auth/forgot-password', { email: email('fulano') })
      const b = await http('POST', '/api/auth/forgot-password', { email: email('nunca-existiu') })
      expect(a.status).toBe(202)
      expect(a.texto).toBe(b.texto)
      expect(caixa.length).toBe(n + 1)
      expect(ultimoEmailPara(email('fulano')).subject).toMatch(/Redefinição/)
      expect(ultimoEmailPara(email('nunca-existiu'))).toBeUndefined()
    })

    it('pedidos em sequência não disparam e-mail repetido (intervalo de 1 minuto)', async () => {
      const n = caixa.length
      await http('POST', '/api/auth/forgot-password', { email: email('fulano') })
      expect(caixa.length).toBe(n)
    })

    it('redefine a senha: a antiga para de valer, a nova entra, e as sessões abertas caem', async () => {
      const token = tokenDoLink(ultimoEmailPara(email('fulano')).link)
      expect((await http('POST', '/api/auth/reset-password', { token, novaSenha: 'curta' })).status).toBe(400) // senha fraca não gasta o link
      expect((await http('POST', '/api/auth/reset-password', { token, novaSenha: NOVA })).status).toBe(200)

      expect((await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })).status).toBe(401)
      expect((await http('POST', '/api/auth/login', { email: email('fulano'), password: NOVA })).status).toBe(200)
      expect((await http('GET', '/api/auth/me', undefined, sessaoAntiga)).status).toBe(401)
    })

    it('o link é de uso único e um link vencido não funciona', async () => {
      const token = tokenDoLink(ultimoEmailPara(email('fulano')).link)
      expect((await http('POST', '/api/auth/reset-password', { token, novaSenha: 'Mais-uma-senha-789' })).status).toBe(400)

      await prisma.authToken.updateMany({ where: { user: { email: email('fulano') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      await http('POST', '/api/auth/forgot-password', { email: email('fulano') })
      const novo = tokenDoLink(ultimoEmailPara(email('fulano')).link)
      await prisma.authToken.updateMany({ where: { tokenHash: { not: '' }, user: { email: email('fulano') }, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await http('POST', '/api/auth/reset-password', { token: novo, novaSenha: 'Mais-uma-senha-789' })).status).toBe(400)
    })

    it('um novo pedido invalida o link anterior', async () => {
      await prisma.authToken.updateMany({ where: { user: { email: email('fulano') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      await http('POST', '/api/auth/forgot-password', { email: email('fulano') })
      const velho = tokenDoLink(ultimoEmailPara(email('fulano')).link)
      await prisma.authToken.updateMany({ where: { user: { email: email('fulano') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      await http('POST', '/api/auth/forgot-password', { email: email('fulano') })
      const novo = tokenDoLink(ultimoEmailPara(email('fulano')).link)
      expect(novo).not.toBe(velho)
      expect((await http('POST', '/api/auth/reset-password', { token: velho, novaSenha: 'Senha-do-velho-1' })).status).toBe(400)
      expect((await http('POST', '/api/auth/reset-password', { token: novo, novaSenha: 'Senha-do-novo-123' })).status).toBe(200)
    })

    it('receber o link prova o e-mail: conta ainda não confirmada passa a confirmada', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('semconfirmar') }))
      expect((await prisma.user.findUnique({ where: { email: email('semconfirmar') } })).emailVerifiedAt).toBeNull()
      await prisma.authToken.updateMany({ where: { user: { email: email('semconfirmar') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      await http('POST', '/api/auth/forgot-password', { email: email('semconfirmar') })
      const token = tokenDoLink(ultimoEmailPara(email('semconfirmar')).link)
      expect((await http('POST', '/api/auth/reset-password', { token, novaSenha: 'Senha-de-quem-esqueceu-1' })).status).toBe(200)
      expect((await prisma.user.findUnique({ where: { email: email('semconfirmar') } })).emailVerifiedAt).not.toBeNull()
    })

    it('conta desativada não recupera senha', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('inativo') }))
      await prisma.user.update({ where: { email: email('inativo') }, data: { active: false } })
      await prisma.authToken.deleteMany({ where: { user: { email: email('inativo') } } })
      const n = caixa.length
      await http('POST', '/api/auth/forgot-password', { email: email('inativo') })
      expect(caixa.length).toBe(n)
    })
  })

  // -----------------------------------------------------------------
  describe('contas criadas por admin e dados públicos', () => {
    it('conta criada pelo admin entra direto; admin confirma e-mail de cadastro público à mão', async () => {
      const { hashPassword } = await import('../../src/services/authService')
      await prisma.user.create({
        data: { email: email('admin'), passwordHash: await hashPassword(SENHA), isAdmin: true, emailVerifiedAt: new Date(), company: { create: { name: `Admin ${sufixo}`, planCode: 'EMPRESARIAL' } } },
      })
      const tokenAdmin = (await http('POST', '/api/auth/login', { email: email('admin'), password: SENHA })).body.token

      const criado = await http('POST', '/api/admin/users', { email: email('porAdmin'), password: SENHA }, tokenAdmin)
      expect(criado.status).toBe(201)
      expect((await http('POST', '/api/auth/login', { email: email('porAdmin'), password: SENHA })).status).toBe(200)

      await http('POST', '/api/auth/register', cadastro({ email: email('pendente') }))
      expect((await http('POST', '/api/auth/login', { email: email('pendente'), password: SENHA })).status).toBe(403)
      const uid = (await prisma.user.findUnique({ where: { email: email('pendente') } })).id
      expect((await http('PATCH', `/api/admin/users/${uid}`, { emailConfirmado: true }, tokenAdmin)).status).toBe(200)
      expect((await http('POST', '/api/auth/login', { email: email('pendente'), password: SENHA })).status).toBe(200)

      const trilha = await http('GET', '/api/admin/audit?action=ADMIN_EMAIL_CONFIRMADO', undefined, tokenAdmin)
      expect(trilha.body.eventos.length).toBeGreaterThan(0)
    })

    it('a auditoria registra cadastro, confirmação e recuperação — sem token nem senha', async () => {
      const admin = (await http('POST', '/api/auth/login', { email: email('admin'), password: SENHA })).body.token
      const r = await http('GET', '/api/admin/audit?limit=200', undefined, admin)
      const acoes: string[] = r.body.eventos.map((e: { action: string }) => e.action)
      expect(acoes).toEqual(expect.arrayContaining(['CADASTRO_CRIADO', 'CADASTRO_RECUSADO', 'EMAIL_VERIFICADO', 'RECUPERACAO_SOLICITADA', 'SENHA_REDEFINIDA_POR_EMAIL']))
      const recusados = r.body.eventos.filter((e: { action: string }) => e.action === 'CADASTRO_RECUSADO')
      expect(JSON.stringify(recusados)).toMatch(/email-existente|documento-existente/)
      const texto = JSON.stringify(r.body)
      expect(texto).not.toContain(SENHA)
      expect(texto).not.toMatch(/tokenHash|passwordHash/)
    })

    it('GET /api/public/plans é público, lista planos ativos e não expõe preço indefinido', async () => {
      const r = await http('GET', '/api/public/plans')
      expect(r.status).toBe(200)
      expect(r.body.trialDias).toBe(14)
      expect(r.body.planos.map((p: { codigo: string }) => p.codigo)).toEqual(expect.arrayContaining(['TESTE', 'ESSENCIAL', 'PROFISSIONAL', 'EMPRESARIAL']))
      expect(r.body.planos[0].limites).toHaveProperty('itensMonitorados')
      expect(r.body.planos[0].precoMensalCentavos).toBeNull()
    })
  })
})
