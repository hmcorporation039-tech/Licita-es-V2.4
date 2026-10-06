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
  describe('cadastro e confirmação de e-mail por código', () => {
    let codigoInicial = ''

    it('cria conta de teste (14 dias), plano TESTE, termos registrados — e responde 202', async () => {
      const r = await http('POST', '/api/auth/register', cadastro())
      expect(r.status).toBe(202)

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

    it('o e-mail traz SÓ o código e a instrução — sem link, botão, nome ou marca; no banco fica só o HMAC', async () => {
      const msg = ultimoEmailPara(email('fulano'))
      expect(msg.subject).toBe('Seu código de confirmação')
      codigoInicial = msg.codigo
      expect(codigoInicial).toMatch(/^\d{6}$/)
      expect(msg.link).toBeUndefined()
      expect(msg.html).not.toMatch(/href|http|<a /i)
      expect(msg.html).toContain(codigoInicial)
      expect(msg.html).toContain('Digite o código na tela de cadastro e confirme o seu acesso.')
      expect(msg.html).not.toMatch(/Fulano|Licita|Monitor/i)

      const tokens = await prisma.authToken.findMany({ where: { user: { email: email('fulano') } } })
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe('EMAIL_CODE')
      expect(tokens[0].tokenHash).not.toContain(codigoInicial) // nunca o código em claro
      expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
      const minutos = (tokens[0].expiresAt.getTime() - Date.now()) / 60_000
      expect(minutos).toBeGreaterThan(14)
      expect(minutos).toBeLessThanOrEqual(15)
    })

    it('antes de confirmar: senha certa é recusada com código estável; senha errada continua 401', async () => {
      const certa = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      expect(certa.status).toBe(403)
      expect(certa.body.code).toBe('EMAIL_NAO_VERIFICADO')
      const errada = await http('POST', '/api/auth/login', { email: email('fulano'), password: 'errada-errada-1' })
      expect(errada.status).toBe(401)
    })

    it('código mal formado é recusado; código errado volta a mesma mensagem de e-mail desconhecido', async () => {
      expect((await http('POST', '/api/auth/verify-email', { email: email('fulano'), codigo: '12345' })).status).toBe(400)
      expect((await http('POST', '/api/auth/verify-email', { email: email('fulano'), codigo: 'abcdef' })).status).toBe(400)
      const errado = codigoInicial === '000000' ? '111111' : '000000'
      const conhecido = await http('POST', '/api/auth/verify-email', { email: email('fulano'), codigo: errado })
      const desconhecido = await http('POST', '/api/auth/verify-email', { email: email('ninguem'), codigo: errado })
      expect(conhecido.status).toBe(400)
      expect(conhecido.body.code).toBe('CODIGO_INVALIDO')
      expect(desconhecido.status).toBe(400)
      expect(desconhecido.body).toEqual(conhecido.body) // não revela se o e-mail tem conta
    })

    it('confirma com o código certo, uma vez só; reusar falha; depois o login funciona', async () => {
      expect((await http('POST', '/api/auth/verify-email', { email: email('fulano'), codigo: codigoInicial })).status).toBe(200)
      expect((await http('POST', '/api/auth/verify-email', { email: email('fulano'), codigo: codigoInicial })).status).toBe(400)
      const login = await http('POST', '/api/auth/login', { email: email('fulano'), password: SENHA })
      expect(login.status).toBe(200)
      expect(login.body.token).toBeTruthy()
    })

    it('e-mail já cadastrado: a tela é AVISADA (409), nenhuma conta nova, e o dono também recebe aviso por e-mail', async () => {
      const antes = caixa.length
      const r = await http('POST', '/api/auth/register', cadastro({ documento: gerarCpf() }))
      expect(r.status).toBe(409)
      expect(r.body.code).toBe('EMAIL_JA_CADASTRADO')
      expect(r.body.error).toMatch(/já está cadastrado/)
      expect(r.body.error).toMatch(/Esqueci minha senha/)
      expect(await prisma.user.count({ where: { email: email('fulano') } })).toBe(1)
      const aviso = caixa.slice(antes).find((m) => m.to === email('fulano'))
      expect(aviso.subject).toMatch(/Tentativa de cadastro/)
      // nenhum código novo foi emitido para a conta existente
      expect(caixa.slice(antes).some((m) => m.to === email('fulano') && m.codigo)).toBe(false)
    })

    it('e-mail com cadastro AINDA NÃO confirmado não é "já cadastrado": recebe novo código normalmente', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('pendente2') }))
      const r = await http('POST', '/api/auth/register', cadastro({ email: email('pendente2') }))
      expect(r.status).toBe(202)
      expect(ultimoEmailPara(email('pendente2')).codigo).toMatch(/^\d{6}$/)
    })

    it('documento já cadastrado com OUTRO e-mail: a tela é avisada (409), nada é criado e o dono da conta recebe aviso', async () => {
      const doc = gerarCpf()
      // 1) cadastro ainda pendente (e-mail não confirmado): a mensagem pede para terminar aquele cadastro
      expect((await http('POST', '/api/auth/register', cadastro({ email: email('pessoa1'), documento: doc }))).status).toBe(202)
      const pendente = await http('POST', '/api/auth/register', cadastro({ email: email('pessoa2'), documento: doc }))
      expect(pendente.status).toBe(409)
      expect(pendente.body.code).toBe('DOCUMENTO_PENDENTE')
      expect(pendente.body.error).toMatch(/aguardando confirmação para este CPF/)
      expect(await prisma.user.count({ where: { email: email('pessoa2') } })).toBe(0)

      // 2) depois de confirmado, é cliente de verdade
      const codigo = ultimoEmailPara(email('pessoa1')).codigo
      expect((await http('POST', '/api/auth/verify-email', { email: email('pessoa1'), codigo })).status).toBe(200)
      const antes = caixa.length
      const cliente = await http('POST', '/api/auth/register', cadastro({ email: email('pessoa3'), documento: doc }))
      expect(cliente.status).toBe(409)
      expect(cliente.body.code).toBe('DOCUMENTO_JA_CADASTRADO')
      expect(cliente.body.error).toMatch(/Já existe um cadastro para este CPF/)
      expect(cliente.texto).not.toContain(email('pessoa1')) // não revela o e-mail do dono da conta
      expect(await prisma.user.count({ where: { email: email('pessoa3') } })).toBe(0)

      // o dono recebe o aviso por e-mail (sem código) e quem tentou não recebe nada
      const aviso = caixa.slice(antes).find((m) => m.to === email('pessoa1'))
      expect(aviso.subject).toMatch(/Tentativa de cadastro com o CPF da sua empresa/)
      expect(aviso.codigo).toBeUndefined()
      expect(caixa.slice(antes).some((m) => m.to === email('pessoa3'))).toBe(false)

      // a máscara não é brecha: o mesmo CPF formatado também é barrado, com a mesma mensagem
      const mascarado = `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`
      const m = await http('POST', '/api/auth/register', cadastro({ email: email('pessoa4'), documento: mascarado }))
      expect(m.status).toBe(409)
      expect(m.body.code).toBe('DOCUMENTO_JA_CADASTRADO')
      expect(await prisma.user.count({ where: { email: email('pessoa4') } })).toBe(0)
    })

    it('o aviso ao dono da conta sai no máximo 1 vez por hora', async () => {
      const doc = gerarCpf()
      await http('POST', '/api/auth/register', cadastro({ email: email('donoaviso'), documento: doc }))
      await http('POST', '/api/auth/verify-email', { email: email('donoaviso'), codigo: ultimoEmailPara(email('donoaviso')).codigo })
      const antes = caixa.length
      await http('POST', '/api/auth/register', cadastro({ email: email('tent1'), documento: doc }))
      await http('POST', '/api/auth/register', cadastro({ email: email('tent2'), documento: doc }))
      await http('POST', '/api/auth/register', cadastro({ email: email('tent3'), documento: doc }))
      expect(caixa.slice(antes).filter((m) => m.to === email('donoaviso'))).toHaveLength(1)
    })

    it('CNPJ (pessoa jurídica) usa o rótulo CNPJ na mensagem', async () => {
      const cnpj = gerarCnpj()
      await http('POST', '/api/auth/register', cadastro({ email: email('empdono'), tipo: 'PESSOA_JURIDICA', documento: cnpj, empresaNome: 'Empresa X Ltda' }))
      await http('POST', '/api/auth/verify-email', { email: email('empdono'), codigo: ultimoEmailPara(email('empdono')).codigo })
      const r = await http('POST', '/api/auth/register', cadastro({ email: email('empoutro'), tipo: 'PESSOA_JURIDICA', documento: cnpj, empresaNome: 'Empresa X Ltda' }))
      expect(r.status).toBe(409)
      expect(r.body.error).toMatch(/Já existe um cadastro para este CNPJ/)
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

    it('reenviar código: respeita o intervalo, invalida o código antigo e ignora conta já confirmada', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('reenvio') }))
      const primeiro = ultimoEmailPara(email('reenvio')).codigo

      // dentro de 1 minuto: não manda outro
      const n = caixa.length
      expect((await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })).status).toBe(202)
      expect(caixa.length).toBe(n)

      // passado o intervalo: manda novo e o antigo morre
      await prisma.authToken.updateMany({ where: { user: { email: email('reenvio') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      expect((await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })).status).toBe(202)
      expect(caixa.length).toBe(n + 1)
      const segundo = ultimoEmailPara(email('reenvio')).codigo
      if (segundo !== primeiro) {
        expect((await http('POST', '/api/auth/verify-email', { email: email('reenvio'), codigo: primeiro })).status).toBe(400)
      }
      expect((await http('POST', '/api/auth/verify-email', { email: email('reenvio'), codigo: segundo })).status).toBe(200)

      // conta já confirmada e e-mail inexistente: mesma resposta, nada enviado
      const m = caixa.length
      const a = await http('POST', '/api/auth/resend-verification', { email: email('reenvio') })
      const b = await http('POST', '/api/auth/resend-verification', { email: email('naoexiste') })
      expect(a.status).toBe(202)
      expect(a.texto).toBe(b.texto)
      expect(caixa.length).toBe(m)
    })

    it('código vencido (15 min) não funciona', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('vencido') }))
      const c = ultimoEmailPara(email('vencido')).codigo
      await prisma.authToken.updateMany({ where: { user: { email: email('vencido') } }, data: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await http('POST', '/api/auth/verify-email', { email: email('vencido'), codigo: c })).status).toBe(400)
    })

    it('5 tentativas erradas queimam o código: nem o certo vale mais; só um código novo', async () => {
      await http('POST', '/api/auth/register', cadastro({ email: email('forca') }))
      const certo = ultimoEmailPara(email('forca')).codigo
      const errado = certo === '000000' ? '111111' : '000000'
      for (let i = 1; i <= 4; i++) {
        const r = await http('POST', '/api/auth/verify-email', { email: email('forca'), codigo: errado })
        expect(r.body.code).toBe('CODIGO_INVALIDO')
      }
      const quinta = await http('POST', '/api/auth/verify-email', { email: email('forca'), codigo: errado })
      expect(quinta.body.code).toBe('CODIGO_BLOQUEADO')
      const depois = await http('POST', '/api/auth/verify-email', { email: email('forca'), codigo: certo })
      expect(depois.status).toBe(400) // o código certo também morreu
      expect((await prisma.user.findUnique({ where: { email: email('forca') } })).emailVerifiedAt).toBeNull()

      // pede um novo código e confirma
      await prisma.authToken.updateMany({ where: { user: { email: email('forca') } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      await http('POST', '/api/auth/resend-verification', { email: email('forca') })
      const novo = ultimoEmailPara(email('forca')).codigo
      expect((await http('POST', '/api/auth/verify-email', { email: email('forca'), codigo: novo })).status).toBe(200)
    })

    it('a auditoria guarda o envio, as tentativas erradas e a confirmação — sem o código', async () => {
      const u = await prisma.user.findUnique({ where: { email: email('forca') } })
      const eventos = await prisma.auditLog.findMany({ where: { entityId: u.id }, orderBy: { createdAt: 'asc' } })
      const acoes = eventos.map((e: { action: string }) => e.action)
      expect(acoes).toEqual(expect.arrayContaining(['CODIGO_ENVIADO', 'CODIGO_INCORRETO', 'CODIGO_BLOQUEADO', 'EMAIL_VERIFICADO']))
      expect(JSON.stringify(eventos)).not.toMatch(/"codigo"/i)
    })

    it('pré-sequestro: quem cadastra o e-mail alheio não consegue ativar a conta (o código vai para o dono do e-mail)', async () => {
      const SENHA_ATACANTE = 'Senha-do-atacante-1'
      await http('POST', '/api/auth/register', cadastro({ email: email('vitima'), senha: SENHA_ATACANTE }))
      const codigoDaVitima = ultimoEmailPara(email('vitima')).codigo // chegou só na caixa da vítima
      // o atacante não tem o código: tenta chutar e não ativa nada
      const chute = codigoDaVitima === '123456' ? '654321' : '123456'
      expect((await http('POST', '/api/auth/verify-email', { email: email('vitima'), codigo: chute })).status).toBe(400)
      expect((await http('POST', '/api/auth/login', { email: email('vitima'), password: SENHA_ATACANTE })).status).toBe(403)

      // a vítima se cadastra de verdade: o cadastro pendente é substituído, e o código antigo morre
      await http('POST', '/api/auth/register', cadastro({ email: email('vitima') }))
      expect(await prisma.user.count({ where: { email: email('vitima') } })).toBe(1)
      const novo = ultimoEmailPara(email('vitima')).codigo
      expect((await http('POST', '/api/auth/verify-email', { email: email('vitima'), codigo: novo })).status).toBe(200)
      expect((await http('POST', '/api/auth/login', { email: email('vitima'), password: SENHA_ATACANTE })).status).toBe(401)
      expect((await http('POST', '/api/auth/login', { email: email('vitima'), password: SENHA })).status).toBe(200)
    })

    it('CPF preso a cadastro abandonado (> 48 h sem confirmar) é liberado para o dono', async () => {
      const doc = gerarCpf()
      await http('POST', '/api/auth/register', cadastro({ email: email('abandonou'), documento: doc }))
      await prisma.user.update({ where: { email: email('abandonou') }, data: { createdAt: new Date(Date.now() - 49 * 3_600_000) } })
      await http('POST', '/api/auth/register', cadastro({ email: email('donodocpf'), documento: doc }))
      expect(await prisma.user.count({ where: { email: email('donodocpf') } })).toBe(1)
      expect(await prisma.user.count({ where: { email: email('abandonou') } })).toBe(0)
    })

    it('aviso de "cadastro repetido" sai no máximo 1 vez por hora para o mesmo e-mail', async () => {
      const n = caixa.length
      await http('POST', '/api/auth/register', cadastro({ documento: gerarCpf() }))
      await http('POST', '/api/auth/register', cadastro({ documento: gerarCpf() }))
      expect(caixa.slice(n).filter((m) => m.to === email('fulano'))).toHaveLength(0) // já avisado neste mesmo teste, há instantes
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
