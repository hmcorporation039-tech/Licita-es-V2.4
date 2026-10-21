import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Suporte: chamados e erros do sistema', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `sup-${sufixo}-`
  const SENHA = 'Senha-forte-123'

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string, cabecalhos: Record<string, string> = {}) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabecalhos },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      body = JSON.parse(texto)
    } catch {
      body = null
    }
    return { status: res.status, body, rastreio: res.headers.get('x-request-id') }
  }

  async function entrar(email: string) {
    return (await http('POST', '/api/auth/login', { email, password: SENHA })).body.token as string
  }

  async function conta(nome: string, extra: { companyId?: string; companyRole?: 'OWNER' | 'MEMBER'; isAdmin?: boolean } = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${prefixo}${nome}@teste.local`,
        name: `Pessoa ${nome}`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: extra.companyRole ?? 'OWNER',
        isAdmin: extra.isAdmin ?? false,
        ...(extra.companyId ? { companyId: extra.companyId } : { company: { create: { name: `Suporte ${sufixo} ${nome}` } } }),
      },
    })
    return { id: u.id as string, companyId: u.companyId as string, token: await entrar(u.email) }
  }

  const novoChamado = (token: string, extra: Record<string, unknown> = {}) =>
    http('POST', '/api/suporte/chamados', { tipo: 'ERRO', assunto: 'A análise não termina', relato: 'Cliquei em analisar e ficou carregando para sempre.', tela: '/tenders/abc?q=x', ...extra }, token)

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
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Suporte ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.erroDoSistema.deleteMany({ where: { OR: [{ companyId: { in: ids } }, { codigoDeRastreio: { startsWith: prefixo } }] } })
    await prisma.chamado.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  it('abre o chamado com o contexto, mostra só para quem pode ver e avisa a resposta do suporte', async () => {
    const dono = await conta('dono')
    const membro = await conta('membro', { companyId: dono.companyId, companyRole: 'MEMBER' })
    const colega = await conta('colega', { companyId: dono.companyId, companyRole: 'MEMBER' })
    const outra = await conta('outra')
    const admin = await conta('admin', { isAdmin: true })

    const aberto = await novoChamado(membro.token, {
      errosRecentes: [{ codigo: `${prefixo}falha-1`, rota: '/api/tenders/abc/analise?x=1', status: 502, mensagem: 'Não foi possível analisar' }],
    })
    expect(aberto.status).toBe(201)
    const numero = aberto.body.numero as number

    const salvo = await prisma.chamado.findUnique({ where: { numero } })
    expect(salvo.status).toBe('ABERTO')
    expect(salvo.contexto.tela).toBe('/tenders/abc')
    expect(salvo.contexto.errosRecentes[0]).toMatchObject({ codigo: `${prefixo}falha-1`, rota: '/api/tenders/abc/analise', status: 502 })
    expect(salvo.contexto.navegador).toBeTruthy()

    expect((await http('GET', `/api/suporte/chamados/${numero}`, undefined, membro.token)).status).toBe(200)
    expect((await http('GET', `/api/suporte/chamados/${numero}`, undefined, dono.token)).status).toBe(200)
    expect((await http('GET', `/api/suporte/chamados/${numero}`, undefined, colega.token)).status).toBe(404)
    expect((await http('GET', `/api/suporte/chamados/${numero}`, undefined, outra.token)).status).toBe(404)
    expect((await http('GET', '/api/suporte/chamados', undefined, outra.token)).body).toEqual([])
    expect((await http('GET', `/api/admin/chamados/${numero}`, undefined, dono.token)).status).toBe(403)

    const resposta = await http('POST', `/api/admin/chamados/${numero}/mensagens`, { texto: 'Já corrigimos, tente de novo.' }, admin.token)
    expect(resposta.status).toBe(201)
    expect(resposta.body.status).toBe('AGUARDANDO_CLIENTE')
    const { caixaDeSaidaDeTeste } = await import('../../src/services/emailTransacional')
    expect(caixaDeSaidaDeTeste.some((m) => m.to === `${prefixo}membro@teste.local` && m.subject === `Resposta ao chamado #${numero}`)).toBe(true)

    const visto = await http('GET', `/api/suporte/chamados/${numero}`, undefined, membro.token)
    expect(visto.body.mensagens).toHaveLength(1)
    expect(visto.body.mensagens[0]).toMatchObject({ autor: 'SUPORTE', nome: 'Suporte Licita Bela' })
    expect(visto.body.diagnostico).toBeUndefined()

    const volta = await http('POST', `/api/suporte/chamados/${numero}/mensagens`, { texto: 'Continua igual.' }, membro.token)
    expect(volta.body.status).toBe('ABERTO')

    const resolvido = await http('POST', `/api/admin/chamados/${numero}/mensagens`, { texto: 'Resolvido de vez.', resolver: true }, admin.token)
    expect(resolvido.body.status).toBe('RESOLVIDO')
    expect((await prisma.chamado.findUnique({ where: { numero } })).resolvidoEm).not.toBeNull()

    const lista = await http('GET', '/api/admin/chamados?status=RESOLVIDO', undefined, admin.token)
    expect(lista.body.chamados.some((c: { numero: number }) => c.numero === numero)).toBe(true)
  })

  it('recusa chamado sem relato e devolve o código de rastreio em toda resposta', async () => {
    const dono = await conta('valida')
    const curto = await novoChamado(dono.token, { relato: 'ruim' })
    expect(curto.status).toBe(400)
    expect(curto.rastreio).toMatch(/^[0-9a-f-]{36}$/)
    const enviado = await http('GET', '/api/suporte/chamados', undefined, dono.token, { 'X-Request-Id': `${prefixo}meu-codigo` })
    expect(enviado.rastreio).toBe(`${prefixo}meu-codigo`)
    const invalido = await http('GET', '/api/suporte/chamados', undefined, dono.token, { 'X-Request-Id': 'x y' })
    expect(invalido.rastreio).not.toBe('x y')
  })

  it('guarda o erro da tela sem segredos e liga ao chamado pelo código', async () => {
    const dono = await conta('tela')
    const admin = await conta('admin-tela', { isAdmin: true })
    const codigo = `${prefixo}tela-1`
    const r = await http('POST', '/api/suporte/erros', { mensagem: 'TypeError: x is undefined Bearer abc.def.ghi', pilha: 'at Pagina (page.tsx:10)', tela: '/dashboard?token=1', codigoDeRastreio: codigo }, dono.token)
    expect(r.status).toBe(204)
    const erro = await prisma.erroDoSistema.findFirst({ where: { codigoDeRastreio: codigo } })
    expect(erro).toMatchObject({ origem: 'web', tela: '/dashboard', userId: dono.id, companyId: dono.companyId })
    expect(erro.mensagem).not.toContain('abc.def.ghi')

    const chamado = await novoChamado(dono.token, { errosRecentes: [{ codigo, mensagem: 'TypeError' }] })
    const detalhe = await http('GET', `/api/admin/chamados/${chamado.body.numero}`, undefined, admin.token)
    expect(detalhe.body.erros.map((e: { codigoDeRastreio: string }) => e.codigoDeRastreio)).toContain(codigo)

    const listados = await http('GET', '/api/admin/erros?origem=web', undefined, admin.token)
    expect(listados.status).toBe(200)
    expect(listados.body.erros.some((e: { codigoDeRastreio: string }) => e.codigoDeRastreio === codigo)).toBe(true)
  })

  it('apaga erros com mais de 30 dias e chamados resolvidos há mais de um ano', async () => {
    const dono = await conta('retencao')
    const { apagarErrosAntigos } = await import('../../src/services/errosDoSistema')
    const { apagarChamadosAntigos } = await import('../../src/services/chamados')
    const antigo = new Date(Date.now() - 31 * 24 * 3_600_000)
    await prisma.erroDoSistema.create({ data: { origem: 'api', mensagem: 'velho', companyId: dono.companyId, codigoDeRastreio: `${prefixo}velho`, createdAt: antigo } })
    await prisma.erroDoSistema.create({ data: { origem: 'api', mensagem: 'novo', companyId: dono.companyId, codigoDeRastreio: `${prefixo}novo` } })
    const velho = await prisma.chamado.create({ data: { companyId: dono.companyId, tipo: 'DUVIDA', assunto: 'x', relato: 'y', status: 'RESOLVIDO', resolvidoEm: new Date(Date.now() - 400 * 24 * 3_600_000) } })
    const aberto = await prisma.chamado.create({ data: { companyId: dono.companyId, tipo: 'DUVIDA', assunto: 'x', relato: 'y', createdAt: antigo } })

    await apagarErrosAntigos()
    await apagarChamadosAntigos()

    expect(await prisma.erroDoSistema.count({ where: { codigoDeRastreio: `${prefixo}velho` } })).toBe(0)
    expect(await prisma.erroDoSistema.count({ where: { codigoDeRastreio: `${prefixo}novo` } })).toBe(1)
    expect(await prisma.chamado.count({ where: { id: velho.id } })).toBe(0)
    expect(await prisma.chamado.count({ where: { id: aberto.id } })).toBe(1)
  })
})
