import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cifrarSegredo, codigoDoPasso, deBase32, gerarCodigosDeRecuperacao, passoDoMomento, resumoDoCodigoDeRecuperacao } from '../../src/lib/segundoFator'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Login em duas etapas do administrador', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `2fa-${sufixo}-`
  const SENHA = 'Senha-forte-123'

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      body = JSON.parse(texto)
    } catch {
      body = null
    }
    return { status: res.status, body }
  }

  async function conta(nome: string, isAdmin: boolean) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        isAdmin,
        company: { create: { name: `2FA ${sufixo} ${nome}` } },
      },
    })
    return { id: u.id as string, email: u.email as string, companyId: u.companyId as string }
  }

  const codigoSeguinte = (segredo: string) => codigoDoPasso(deBase32(segredo), passoDoMomento(new Date()) + 1)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.SEGUNDO_FATOR_DO_ADMIN = 'ligado'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)

  afterAll(async () => {
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `2FA ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    const usuarios = await prisma.user.findMany({ where: { email: { startsWith: prefixo } }, select: { id: true } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ companyId: { in: ids } }, { actorUserId: { in: usuarios.map((u: { id: string }) => u.id) } }] } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    delete process.env.SEGUNDO_FATOR_DO_ADMIN
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('cadastra o aplicativo, entra com o código e com o código de recuperação, e barra quem não tem', async () => {
    const admin = await conta('admin', true)
    const cliente = await conta('cliente', false)

    const semSegundoFator = (await http('POST', '/api/auth/login', { email: admin.email, password: SENHA })).body.token as string
    expect(semSegundoFator).toBeTruthy()
    const barrado = await http('GET', '/api/admin/users', undefined, semSegundoFator)
    expect(barrado.status).toBe(403)
    expect(barrado.body.code).toBe('SEGUNDO_FATOR_PENDENTE')
    expect((await http('GET', '/api/segundo-fator', undefined, semSegundoFator)).body).toMatchObject({ disponivel: true, ativo: false })

    const tokenDoCliente = (await http('POST', '/api/auth/login', { email: cliente.email, password: SENHA })).body.token as string
    expect((await http('POST', '/api/segundo-fator/aplicativo', { senha: SENHA }, tokenDoCliente)).status).toBe(403)
    expect((await http('GET', '/api/segundo-fator', undefined, tokenDoCliente)).body.disponivel).toBe(false)

    expect((await http('POST', '/api/segundo-fator/aplicativo', { senha: 'errada' }, semSegundoFator)).status).toBe(400)
    const aplicativo = await http('POST', '/api/segundo-fator/aplicativo', { senha: SENHA }, semSegundoFator)
    expect(aplicativo.status).toBe(200)
    expect(aplicativo.body.qrCodeSvg).toContain('<svg')
    expect(aplicativo.body.endereco).toContain('otpauth://totp/')
    const segredo = String(aplicativo.body.segredo).replace(/\s/g, '')

    const guardado = await prisma.user.findUnique({ where: { id: admin.id }, select: { totpSegredoNovo: true, totpSegredo: true } })
    expect(guardado.totpSegredo).toBeNull()
    expect(guardado.totpSegredoNovo).not.toContain(segredo)

    expect((await http('POST', '/api/segundo-fator/ativar', { codigo: '000000' }, semSegundoFator)).status).toBe(400)
    const codigoDeAtivacao = codigoDoPasso(deBase32(segredo), passoDoMomento(new Date()))
    const ativado = await http('POST', '/api/segundo-fator/ativar', { codigo: codigoDeAtivacao }, semSegundoFator)
    expect(ativado.status).toBe(200)
    const recuperacao = ativado.body.codigosDeRecuperacao as string[]
    expect(recuperacao).toHaveLength(8)
    expect((await http('GET', '/api/auth/me', undefined, semSegundoFator)).status).toBe(401)
    expect((await http('GET', '/api/admin/users', undefined, ativado.body.token)).status).toBe(200)

    const primeiraEtapa = await http('POST', '/api/auth/login', { email: admin.email, password: SENHA })
    expect(primeiraEtapa.status).toBe(200)
    expect(primeiraEtapa.body.token).toBeUndefined()
    expect(primeiraEtapa.body.segundoFator).toBe(true)
    const desafio = primeiraEtapa.body.desafio as string
    expect((await http('GET', '/api/auth/me', undefined, desafio)).status).toBe(401)

    const repetido = await http('POST', '/api/auth/login/segundo-fator', { desafio, codigo: codigoDeAtivacao })
    expect(repetido.status).toBe(401)
    expect(repetido.body.code).toBe('SEGUNDO_FATOR_INCORRETO')
    expect((await http('POST', '/api/auth/login/segundo-fator', { desafio: 'x'.repeat(40), codigo: '123456' })).body.code).toBe('DESAFIO_EXPIRADO')

    const entrou = await http('POST', '/api/auth/login/segundo-fator', { desafio, codigo: codigoSeguinte(segredo) })
    expect(entrou.status).toBe(200)
    expect(entrou.body.user.isAdmin).toBe(true)
    expect((await http('GET', '/api/admin/users', undefined, entrou.body.token)).status).toBe(200)

    const outroDesafio = (await http('POST', '/api/auth/login', { email: admin.email, password: SENHA })).body.desafio as string
    const comRecuperacao = await http('POST', '/api/auth/login/segundo-fator', { desafio: outroDesafio, codigo: recuperacao[0].toLowerCase() })
    expect(comRecuperacao.status).toBe(200)
    expect(comRecuperacao.body).toMatchObject({ viaCodigoDeRecuperacao: true, codigosDeRecuperacaoRestantes: 7 })
    expect((await http('POST', '/api/auth/login/segundo-fator', { desafio: outroDesafio, codigo: recuperacao[0] })).status).toBe(401)

    const auditoria = await prisma.auditLog.findMany({ where: { actorUserId: admin.id }, select: { action: true, metadata: true } })
    const acoes = auditoria.map((a: { action: string }) => a.action)
    expect(acoes).toEqual(expect.arrayContaining(['SEGUNDO_FATOR_ATIVADO', 'SEGUNDO_FATOR_INCORRETO', 'SEGUNDO_FATOR_CODIGO_DE_RECUPERACAO_USADO']))
    expect(auditoria.some((a: { action: string; metadata: { segundoFator?: string } | null }) => a.action === 'LOGIN_OK' && a.metadata?.segundoFator === 'aplicativo')).toBe(true)
    expect(JSON.stringify(auditoria)).not.toContain(segredo)
  })

  it('pede o código de novo nas ações sensíveis depois de 15 minutos e em sessão antiga', async () => {
    const { signSessionToken } = await import('../../src/services/authService')
    const admin = await conta('sensivel', true)
    const alvo = await conta('alvo', false)
    const recuperacao = gerarCodigosDeRecuperacao()
    const atualizado = await prisma.user.update({
      where: { id: admin.id },
      data: {
        totpSegredo: cifrarSegredo('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', process.env.JWT_SECRET!),
        totpAtivadoEm: new Date(),
        totpCodigosDeRecuperacao: recuperacao.map(resumoDoCodigoDeRecuperacao),
      },
      select: { tokenVersion: true },
    })
    const agora = Math.floor(Date.now() / 1000)

    const sessaoAntiga = signSessionToken(admin.id, atualizado.tokenVersion)
    expect((await http('GET', '/api/admin/users', undefined, sessaoAntiga)).body.code).toBe('SEGUNDO_FATOR_NECESSARIO')

    const confirmadoHaVinteMinutos = signSessionToken(admin.id, atualizado.tokenVersion, agora - 20 * 60)
    expect((await http('GET', '/api/admin/users', undefined, confirmadoHaVinteMinutos)).status).toBe(200)
    const pedeDeNovo = await http('PATCH', `/api/admin/users/${alvo.id}`, { diasValidade: 30 }, confirmadoHaVinteMinutos)
    expect(pedeDeNovo.status).toBe(403)
    expect(pedeDeNovo.body.code).toBe('SEGUNDO_FATOR_RECENTE')
    expect((await http('POST', '/api/admin/cupons', { codigo: `T${sufixo}`, percentual: 10, meses: 1 }, confirmadoHaVinteMinutos)).body.code).toBe('SEGUNDO_FATOR_RECENTE')

    expect((await http('POST', '/api/segundo-fator/confirmar', { codigo: '000000' }, confirmadoHaVinteMinutos)).status).toBe(400)
    const confirmado = await http('POST', '/api/segundo-fator/confirmar', { codigo: recuperacao[1] }, confirmadoHaVinteMinutos)
    expect(confirmado.status).toBe(200)
    expect((await http('PATCH', `/api/admin/users/${alvo.id}`, { diasValidade: 30 }, confirmado.body.token)).status).toBe(200)

    const trocouSenha = await http('POST', '/api/auth/change-password', { currentPassword: SENHA, newPassword: 'Outra-senha-forte-456' }, confirmado.body.token)
    expect(trocouSenha.status).toBe(200)
    expect((await http('PATCH', `/api/admin/users/${alvo.id}`, { diasValidade: 15 }, trocouSenha.body.token)).status).toBe(200)

    const semCodigoAtual = await http('POST', '/api/segundo-fator/aplicativo', { senha: 'Outra-senha-forte-456' }, trocouSenha.body.token)
    expect(semCodigoAtual.body.code).toBe('SEGUNDO_FATOR_ATUAL')
    const novoAparelho = await http('POST', '/api/segundo-fator/aplicativo', { senha: 'Outra-senha-forte-456', codigoAtual: recuperacao[2] }, trocouSenha.body.token)
    expect(novoAparelho.status).toBe(200)
    const aindaVale = await prisma.user.findUnique({ where: { id: admin.id }, select: { totpSegredo: true, totpSegredoNovo: true } })
    expect(aindaVale.totpSegredo).toBeTruthy()
    expect(aindaVale.totpSegredoNovo).toBeTruthy()

    expect((await http('POST', '/api/segundo-fator/codigos-de-recuperacao', { codigo: '000000' }, trocouSenha.body.token)).status).toBe(400)
    const renovados = await http('POST', '/api/segundo-fator/codigos-de-recuperacao', { codigo: recuperacao[3] }, trocouSenha.body.token)
    expect(renovados.body.codigosDeRecuperacao).toHaveLength(8)
    expect((await http('GET', '/api/segundo-fator', undefined, trocouSenha.body.token)).body.codigosDeRecuperacaoRestantes).toBe(8)
  })
})
