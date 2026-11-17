// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): painel "Funil" do administrador.
// Cadastros públicos entram na lista com origem, uso e pagamento; conta criada pelo admin fica
// de fora; quem não é admin recebe 403. O banco é compartilhado com outros testes, então as
// verificações olham só os cadastros criados aqui.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

interface Contato {
  email: string
  telefone: string | null
  whatsapp: string | null
  tipoDeDocumento: 'CNPJ' | 'CPF'
  plano: string
  origem: { fonte: string; campanha: string | null; termo: string | null }
  interesse: { termo: string; uf: string | null } | null
  emailConfirmado: boolean
  usou: boolean
  pagante: boolean
  ultimaAtividade: string | null
}

rodar('Admin: funil de vendas', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  let tokenAdmin = ''
  let tokenComum = ''
  const empresas: string[] = []

  async function get(caminho: string, token: string) {
    const res = await fetch(base + caminho, { headers: { Authorization: `Bearer ${token}` } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, body: (await res.json()) as any }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const { hashPassword } = await import('../../src/services/authService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const hash = await hashPassword(SENHA)
    const agora = new Date()
    const admin = await prisma.user.create({
      data: { email: `adm-funil-${sufixo}@teste.local`, passwordHash: hash, isAdmin: true, emailVerifiedAt: agora, company: { create: { name: `Admin ${sufixo}` } } },
    })
    const comum = await prisma.user.create({
      data: { email: `comum-funil-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: agora, company: { create: { name: `Comum ${sufixo}` } } },
    })
    empresas.push(admin.companyId, comum.companyId)

    // Cadastro público vindo do anúncio do Google, confirmado, só com o item automático do interesse.
    const doAnuncio = await prisma.user.create({
      data: {
        email: `anuncio-${sufixo}@teste.local`,
        name: 'Ana Anúncio',
        passwordHash: hash,
        emailVerifiedAt: agora,
        termsAcceptedAt: agora,
        createdAt: agora,
        accessExpiresAt: new Date(agora.getTime() + 7 * 86_400_000),
        company: {
          create: {
            name: `Anúncio ${sufixo}`,
            tipo: 'PESSOA_JURIDICA',
            telefone: '(62) 99999-0000',
            origemDoCadastro: { gclid: 'abc', utm_campaign: 'pesquisa', utm_term: 'licitação', interesse: { termo: 'cadeiras', uf: 'GO' } },
          },
        },
      },
    })
    await prisma.monitoredItem.create({ data: { companyId: doAnuncio.companyId, userId: doAnuncio.id, name: 'Cadeiras', keywords: ['cadeiras'], ufs: ['GO'] } })

    // Cadastro direto que criou o próprio item e assinou.
    const pagante = await prisma.user.create({
      data: { email: `pagante-${sufixo}@teste.local`, name: 'Paulo Pagante', passwordHash: hash, emailVerifiedAt: agora, termsAcceptedAt: agora, createdAt: agora, company: { create: { name: `Pagante ${sufixo}` } } },
    })
    await prisma.monitoredItem.create({ data: { companyId: pagante.companyId, userId: pagante.id, name: 'Papel', keywords: ['papel'] } })
    await prisma.assinatura.create({
      data: { companyId: pagante.companyId, planCode: 'ESSENCIAL', ciclo: 'MENSAL', status: 'ATIVA', ambiente: 'sandbox', asaasClienteId: `cli-${sufixo}`, valorCentavos: 9900, valorCheioCentavos: 9900 },
    })

    // Conta criada pelo admin: sem aceite no cadastro, não é cadastro público.
    const peloAdmin = await prisma.user.create({
      data: { email: `peloadmin-${sufixo}@teste.local`, passwordHash: hash, emailVerifiedAt: agora, company: { create: { name: `Pelo admin ${sufixo}` } } },
    })
    empresas.push(doAnuncio.companyId, pagante.companyId, peloAdmin.companyId)

    const entrar = async (email: string) =>
      ((await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: SENHA }) })).json()) as { token: string }).token
    tokenAdmin = await entrar(admin.email)
    tokenComum = await entrar(comum.email)
  }, 60_000)

  afterAll(async () => {
    if (prisma) {
      await prisma.assinatura.deleteMany({ where: { companyId: { in: empresas } } })
      await prisma.monitoredItem.deleteMany({ where: { companyId: { in: empresas } } })
      await prisma.user.deleteMany({ where: { companyId: { in: empresas } } })
      await prisma.company.deleteMany({ where: { id: { in: empresas } } })
    }
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('quem não é admin não vê o funil', async () => {
    expect((await get('/api/admin/funil', tokenComum)).status).toBe(403)
  })

  it('lista os cadastros públicos com origem, uso, pagamento e WhatsApp, e audita a consulta', async () => {
    const r = await get('/api/admin/funil?dias=7', tokenAdmin)
    expect(r.status).toBe(200)
    expect(r.body.dias).toBe(7)
    expect(r.body.totais.cadastros).toBeGreaterThanOrEqual(2)
    expect(r.body.semanas.length).toBeGreaterThanOrEqual(1)
    const contatos = r.body.contatos as Contato[]
    const emails = contatos.map((c) => c.email)
    expect(emails).not.toContain(`peloadmin-${sufixo}@teste.local`)
    expect(emails).not.toContain(`comum-funil-${sufixo}@teste.local`)

    const anuncio = contatos.find((c) => c.email === `anuncio-${sufixo}@teste.local`)
    expect(anuncio).toMatchObject({
      whatsapp: 'https://wa.me/5562999990000',
      tipoDeDocumento: 'CNPJ',
      plano: 'TESTE',
      origem: { fonte: 'google', campanha: 'pesquisa', termo: 'licitação' },
      interesse: { termo: 'cadeiras', uf: 'GO' },
      emailConfirmado: true,
      usou: false,
      pagante: false,
    })
    const pagante = contatos.find((c) => c.email === `pagante-${sufixo}@teste.local`)
    expect(pagante).toMatchObject({ whatsapp: null, tipoDeDocumento: 'CPF', origem: { fonte: 'direto' }, usou: true, pagante: true })
    expect(pagante?.ultimaAtividade).not.toBeNull()

    const google = (r.body.origens as Array<{ origem: string; cadastros: number }>).find((o) => o.origem === 'google / pesquisa')
    expect(google?.cadastros).toBeGreaterThanOrEqual(1)
    expect(await prisma.auditLog.count({ where: { action: 'ADMIN_CONSULTOU_FUNIL', actorEmail: `adm-funil-${sufixo}@teste.local` } })).toBe(1)
  })

  it('período fora de 7/30/90 cai em 30 dias', async () => {
    expect((await get('/api/admin/funil?dias=12', tokenAdmin)).body.dias).toBe(30)
  })
})
