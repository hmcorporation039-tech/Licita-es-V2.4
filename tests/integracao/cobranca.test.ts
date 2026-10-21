import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Cobrador, CobrancaDoAsaas, NovaAssinatura } from '../../src/services/asaas'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Cobrança pelo Asaas', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caixa: any[] = []
  let desconectar: () => void = () => undefined
  let usarCobrador: (c: Cobrador | null | undefined) => void = () => undefined
  let precosAntes: { code: string; priceMonthlyCents: number | null; priceYearlyCents: number | null }[] = []
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `cob-${sufixo}-`
  const SENHA = 'Senha-forte-123'
  const TOKEN = `token-do-webhook-${sufixo}-${'x'.repeat(24)}`

  const cobrancas = new Map<string, CobrancaDoAsaas>()
  const assinaturasNoAsaas = new Map<string, NovaAssinatura & { ativa: boolean }>()
  const chamadas: string[] = []
  let sequencia = 0
  const novoId = (p: string) => `${p}_${sufixo}_${++sequencia}`

  function criarCobranca(assinatura: string, vencimento: string, valorCentavos: number): string {
    const id = novoId('pay')
    cobrancas.set(id, {
      id,
      status: 'PENDING',
      billingType: 'UNDEFINED',
      value: valorCentavos / 100,
      netValue: null,
      dueDate: vencimento,
      paymentDate: null,
      clientPaymentDate: null,
      confirmedDate: null,
      invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
      subscription: assinatura,
      deleted: false,
    })
    return id
  }

  let ErroDoAsaas: new (m: string, s: number, p: string | null) => Error

  const asaasFalso: Cobrador = {
    ambiente: 'sandbox',
    async criarCliente() {
      chamadas.push('cliente')
      return { id: novoId('cus') }
    },
    async criarAssinatura(d) {
      const id = novoId('sub')
      assinaturasNoAsaas.set(id, { ...d, ativa: true })
      criarCobranca(id, d.vencimento, d.valorCentavos)
      return { id }
    },
    async cobrancasDaAssinatura(id) {
      return [...cobrancas.values()].filter((c) => c.subscription === id).map((c) => ({ ...c }))
    },
    async buscarCobranca(id) {
      const c = cobrancas.get(id)
      if (!c) throw new ErroDoAsaas('não existe', 404, null)
      return { ...c }
    },
    async cancelarAssinatura(id) {
      chamadas.push(`cancelar:${id}`)
      const a = assinaturasNoAsaas.get(id)
      if (a) a.ativa = false
      for (const c of cobrancas.values()) if (c.subscription === id && c.status === 'PENDING') c.deleted = true
    },
    async mudarValorDaAssinatura(id, valorCentavos) {
      chamadas.push(`valor:${id}:${valorCentavos}`)
      for (const c of cobrancas.values()) if (c.subscription === id && c.status === 'PENDING') c.value = valorCentavos / 100
    },
    async estornarCobranca(id) {
      chamadas.push(`estorno:${id}`)
      const c = cobrancas.get(id)
      if (c) c.status = 'REFUNDED'
    },
  }

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
    return { status: res.status, body }
  }

  async function entrar(email: string) {
    return (await http('POST', '/api/auth/login', { email, password: SENHA })).body?.token as string
  }

  async function conta(nome: string, extra: { companyId?: string; companyRole?: 'OWNER' | 'MEMBER'; isAdmin?: boolean; cnpj?: string | null; acessoAte?: Date | null } = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const email = `${prefixo}${nome}@teste.local`
    const u = await prisma.user.create({
      data: {
        email,
        name: `Pessoa ${nome}`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        companyRole: extra.companyRole ?? 'OWNER',
        isAdmin: extra.isAdmin ?? false,
        accessExpiresAt: extra.acessoAte === undefined ? new Date(Date.now() + 3 * 86_400_000) : extra.acessoAte,
        ...(extra.companyId
          ? { companyId: extra.companyId }
          : { company: { create: { name: `Cobranca ${sufixo} ${nome}`, tipo: 'PESSOA_JURIDICA', cnpj: extra.cnpj === null ? null : (extra.cnpj ?? `${sufixo.replace(/\D/g, '0').padEnd(8, '0').slice(0, 8)}${String(++sequencia).padStart(6, '0')}`) } } }),
      },
    })
    const token = extra.acessoAte && extra.acessoAte.getTime() < Date.now() ? '' : await entrar(email)
    return { id: u.id as string, email, companyId: u.companyId as string, token }
  }

  async function aviso(evento: string, cobrancaId: string, id: string = novoId('evt')) {
    return http('POST', '/api/cobranca/webhook', { id, event: evento, payment: { id: cobrancaId, subscription: cobrancas.get(cobrancaId)?.subscription } }, undefined, { 'asaas-access-token': TOKEN })
  }

  function pagar(cobrancaId: string, status = 'RECEIVED') {
    const c = cobrancas.get(cobrancaId)!
    c.status = status
    c.paymentDate = c.dueDate
  }

  const cobrancasDe = (assinaturaAsaas: string) => [...cobrancas.values()].filter((c) => c.subscription === assinaturaAsaas)

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const asaas = await import('../../src/services/asaas')
    ErroDoAsaas = asaas.ErroDoAsaas
    usarCobrador = asaas.usarCobradorDeTeste
    usarCobrador(asaasFalso)
    caixa = (await import('../../src/services/emailTransacional')).caixaDeSaidaDeTeste
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    precosAntes = await prisma.subscriptionPlan.findMany({ where: { code: { in: ['ESSENCIAL', 'PROFISSIONAL'] } }, select: { code: true, priceMonthlyCents: true, priceYearlyCents: true } })
    await prisma.subscriptionPlan.update({ where: { code: 'ESSENCIAL' }, data: { priceMonthlyCents: 14900, priceYearlyCents: 149000 } })
    await prisma.subscriptionPlan.update({ where: { code: 'PROFISSIONAL' }, data: { priceMonthlyCents: 32900, priceYearlyCents: 329000 } })
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)

  afterAll(async () => {
    usarCobrador(undefined)
    for (const p of precosAntes) await prisma.subscriptionPlan.update({ where: { code: p.code }, data: { priceMonthlyCents: p.priceMonthlyCents, priceYearlyCents: p.priceYearlyCents } })
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Cobranca ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.pagamento.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.assinatura.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.cupom.deleteMany({ where: { codigo: { startsWith: `T${sufixo.toUpperCase()}` } } })
    await prisma.eventoDeCobranca.deleteMany({ where: { id: { contains: sufixo } } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: prefixo } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  it('sem chave do Asaas a cobrança fica desligada e quem não é dono não assina', async () => {
    const dono = await conta('desligada')
    const membro = await conta('membro-desligada', { companyId: dono.companyId, companyRole: 'MEMBER' })
    usarCobrador(null)
    expect((await http('GET', '/api/cobranca/planos')).body).toEqual({ disponivel: false, planos: [] })
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL' }, dono.token)).status).toBe(503)
    usarCobrador(asaasFalso)
    const planos = (await http('GET', '/api/cobranca/planos')).body
    expect(planos.disponivel).toBe(true)
    expect(planos.planos.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['ESSENCIAL', 'PROFISSIONAL']))
    expect(planos.planos.map((p: { code: string }) => p.code)).not.toContain('TESTE')
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL' }, membro.token)).status).toBe(403)
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'TESTE', ciclo: 'MENSAL' }, dono.token)).status).toBe(400)
    const semDocumento = await conta('sem-documento', { cnpj: null })
    const r = await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL' }, semDocumento.token)
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('SEM_DOCUMENTO')
  })

  it('assina com cupom, libera o plano ao pagar, avisa atraso e encerra o desconto no 13º mês', async () => {
    const admin = await conta('admin', { isAdmin: true, acessoAte: null })
    const codigo = `T${sufixo.toUpperCase()}-FUNDADOR`
    const criado = await http('POST', '/api/admin/cupons', { codigo, percentual: 35, meses: 12, maxUsos: 1 }, admin.token)
    expect(criado.status).toBe(201)
    expect((await http('POST', '/api/admin/cupons', { codigo, percentual: 10, meses: 1 }, admin.token)).status).toBe(409)

    const dono = await conta('fundador')
    const membro = await conta('membro-fundador', { companyId: dono.companyId, companyRole: 'MEMBER' })
    const r = await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL', cupom: codigo.toLowerCase() }, dono.token)
    expect(r.status).toBe(201)
    expect(r.body.linkDaFatura).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//)
    const outra = await conta('sem-vaga')
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL', cupom: codigo }, outra.token)).body.error).toBe('As vagas deste cupom acabaram')

    const local = await prisma.assinatura.findUnique({ where: { id: r.body.assinaturaId } })
    expect(local).toMatchObject({ status: 'PENDENTE', valorCentavos: 9685, valorCheioCentavos: 14900, ambiente: 'sandbox' })
    const [primeira] = cobrancasDe(local.asaasAssinaturaId)
    expect(primeira.value).toBe(96.85)
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL', cupom: codigo }, dono.token)).body.linkDaFatura).toBe(r.body.linkDaFatura)

    expect((await http('POST', '/api/cobranca/webhook', { id: novoId('evt'), event: 'PAYMENT_RECEIVED', payment: { id: primeira.id } }, undefined, { 'asaas-access-token': 'errado' })).status).toBe(401)
    expect((await prisma.company.findUnique({ where: { id: dono.companyId } })).planCode).toBe('TESTE')

    pagar(primeira.id)
    caixa.length = 0
    const idDoEvento = novoId('evt')
    expect((await aviso('PAYMENT_RECEIVED', primeira.id, idDoEvento)).body.resultado).toBe('ok: RECEIVED')
    expect((await aviso('PAYMENT_RECEIVED', primeira.id, idDoEvento)).body.resultado).toBe('repetido')
    expect((await prisma.company.findUnique({ where: { id: dono.companyId } })).planCode).toBe('ESSENCIAL')
    const ativa = await prisma.assinatura.findUnique({ where: { id: local.id } })
    expect(ativa.status).toBe('ATIVA')
    const acessoDoMembro = (await prisma.user.findUnique({ where: { id: membro.id } })).accessExpiresAt.getTime()
    expect(acessoDoMembro).toBe(ativa.pagoAte.getTime() + 5 * 86_400_000)
    expect((await prisma.user.findUnique({ where: { id: dono.id } })).accessExpiresAt.getTime()).toBe(acessoDoMembro)
    expect(caixa.filter((m) => m.to === dono.email && m.subject === 'Pagamento confirmado: Licita Bela')).toHaveLength(1)
    expect(caixa.some((m) => m.to === membro.email)).toBe(false)

    const vencimento2 = new Date(ativa.pagoAte.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
    const segunda = criarCobranca(local.asaasAssinaturaId, vencimento2, 9685)
    caixa.length = 0
    await aviso('PAYMENT_CREATED', segunda)
    expect(caixa.filter((m) => m.subject.startsWith('Fatura da Licita Bela: vence em'))).toHaveLength(1)
    cobrancas.get(segunda)!.status = 'OVERDUE'
    await aviso('PAYMENT_OVERDUE', segunda)
    await aviso('PAYMENT_OVERDUE', segunda)
    expect(caixa.filter((m) => m.subject === 'Fatura da Licita Bela vencida')).toHaveLength(1)
    expect((await prisma.assinatura.findUnique({ where: { id: local.id } })).status).toBe('ATRASADA')
    pagar(segunda)
    await aviso('PAYMENT_RECEIVED', segunda)
    const emDia = await prisma.assinatura.findUnique({ where: { id: local.id } })
    expect(emDia.status).toBe('ATIVA')
    expect(emDia.pagoAte.getTime()).toBeGreaterThan(ativa.pagoAte.getTime())

    const decimaTerceira = criarCobranca(local.asaasAssinaturaId, new Date(local.descontoAte.getTime() + 2 * 86_400_000).toISOString().slice(0, 10), 9685)
    await aviso('PAYMENT_CREATED', decimaTerceira)
    expect(chamadas).toContain(`valor:${local.asaasAssinaturaId}:14900`)
    expect(cobrancas.get(decimaTerceira)!.value).toBe(149)
    expect((await prisma.pagamento.findUnique({ where: { asaasCobrancaId: decimaTerceira } })).valorCentavos).toBe(14900)
    expect((await prisma.assinatura.findUnique({ where: { id: local.id } })).valorCentavos).toBe(14900)

    const painel = await http('GET', '/api/admin/cobranca', undefined, admin.token)
    expect(painel.status).toBe(200)
    expect(painel.body.assinaturas.some((a: { id: string }) => a.id === local.id)).toBe(true)
    expect(painel.body.mes.recebidoCentavos).toBeGreaterThanOrEqual(9685 * 2)
    expect((await http('GET', '/api/admin/cobranca', undefined, dono.token)).status).toBe(403)

    const resumo = await http('GET', '/api/cobranca', undefined, membro.token)
    expect(resumo.body.podeGerenciar).toBe(false)
    expect(resumo.body.assinatura.status).toBe('ATIVA')
    expect(resumo.body.pagamentos.length).toBeGreaterThanOrEqual(3)

    const pagoAte = (await prisma.assinatura.findUnique({ where: { id: local.id } })).pagoAte
    expect((await http('POST', '/api/cobranca/cancelar', {}, dono.token)).status).toBe(200)
    expect(chamadas).toContain(`cancelar:${local.asaasAssinaturaId}`)
    expect((await prisma.assinatura.findUnique({ where: { id: local.id } })).status).toBe('CANCELADA')
    expect((await prisma.user.findUnique({ where: { id: membro.id } })).accessExpiresAt.getTime()).toBe(pagoAte.getTime())
    expect((await prisma.pagamento.findUnique({ where: { asaasCobrancaId: decimaTerceira } })).status).toBe('DELETED')
  })

  it('trocar de plano antes de pagar cancela a fatura anterior; reembolso de 7 dias cancela e encerra o acesso', async () => {
    const admin = await conta('admin-reembolso', { isAdmin: true, acessoAte: null })
    const dono = await conta('reembolso')
    const primeiro = await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL' }, dono.token)
    const trocado = await http('POST', '/api/cobranca/assinar', { planCode: 'PROFISSIONAL', ciclo: 'ANUAL' }, dono.token)
    expect(trocado.status).toBe(201)
    expect(trocado.body.assinaturaId).not.toBe(primeiro.body.assinaturaId)
    expect((await prisma.assinatura.findUnique({ where: { id: primeiro.body.assinaturaId } })).motivoDoCancelamento).toBe('TROCOU_ANTES_DE_PAGAR')
    expect((await prisma.user.findUnique({ where: { id: dono.id } })).accessExpiresAt.getTime()).toBeGreaterThan(Date.now())

    const local = await prisma.assinatura.findUnique({ where: { id: trocado.body.assinaturaId } })
    expect(local).toMatchObject({ planCode: 'PROFISSIONAL', ciclo: 'ANUAL', valorCentavos: 329000 })
    const [cobranca] = cobrancasDe(local.asaasAssinaturaId)
    pagar(cobranca.id, 'CONFIRMED')
    cobrancas.get(cobranca.id)!.billingType = 'BOLETO'
    await aviso('PAYMENT_CONFIRMED', cobranca.id)
    const boleto = await http('POST', `/api/admin/cobranca/assinaturas/${local.id}/reembolsar`, {}, admin.token)
    expect(boleto.status).toBe(409)
    expect(boleto.body.error).toContain('Para boleto')
    cobrancas.get(cobranca.id)!.billingType = 'CREDIT_CARD'
    await aviso('PAYMENT_UPDATED', cobranca.id)
    expect((await prisma.assinatura.findUnique({ where: { id: local.id } })).pagoAte.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000)
    expect((await http('POST', '/api/cobranca/assinar', { planCode: 'ESSENCIAL', ciclo: 'MENSAL' }, dono.token)).status).toBe(409)

    expect((await http('POST', `/api/admin/cobranca/assinaturas/${local.id}/reembolsar`, {}, admin.token)).status).toBe(200)
    expect(chamadas).toContain(`estorno:${cobranca.id}`)
    expect((await prisma.assinatura.findUnique({ where: { id: local.id } })).motivoDoCancelamento).toBe('ESTORNO')
    expect((await prisma.user.findUnique({ where: { id: dono.id } })).accessExpiresAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect((await http('GET', '/api/cobranca', undefined, dono.token)).status).toBe(403)
    expect((await http('POST', `/api/admin/cobranca/assinaturas/${local.id}/reembolsar`, {}, admin.token)).status).toBe(409)
    expect((await aviso('PAYMENT_REFUNDED', cobranca.id)).body.resultado).toBe('ok: REFUNDED')
  })

  it('o dono com acesso encerrado assina e paga sem conseguir entrar, e o acesso volta', async () => {
    const dono = await conta('encerrado', { acessoAte: new Date(Date.now() - 86_400_000) })
    const membro = await conta('membro-encerrado', { companyId: dono.companyId, companyRole: 'MEMBER', acessoAte: new Date(Date.now() - 86_400_000) })
    expect((await http('POST', '/api/auth/login', { email: dono.email, password: SENHA })).status).toBe(403)
    const pedido = { email: dono.email, password: SENHA, planCode: 'ESSENCIAL', ciclo: 'MENSAL' }
    expect((await http('POST', '/api/auth/acesso-encerrado/assinar', { ...pedido, password: 'errada-123' })).status).toBe(401)
    expect((await http('POST', '/api/auth/acesso-encerrado/assinar', { ...pedido, email: membro.email })).status).toBe(403)
    const r = await http('POST', '/api/auth/acesso-encerrado/assinar', pedido)
    expect(r.status).toBe(201)
    expect(r.body.linkDaFatura).toBeTruthy()
    const local = await prisma.assinatura.findUnique({ where: { id: r.body.assinaturaId } })
    const [cobranca] = cobrancasDe(local.asaasAssinaturaId)
    pagar(cobranca.id)
    await aviso('PAYMENT_RECEIVED', cobranca.id)
    expect((await http('POST', '/api/auth/login', { email: dono.email, password: SENHA })).status).toBe(200)
    expect((await http('POST', '/api/auth/login', { email: membro.email, password: SENHA })).status).toBe(200)
    expect((await http('POST', '/api/auth/acesso-encerrado/assinar', pedido)).status).toBe(409)
  })

  it('aviso de cobrança desconhecida ou removida não quebra o webhook', async () => {
    expect((await aviso('PAYMENT_RECEIVED', `pay_${sufixo}_nao_existe`)).body.resultado).toBe('ignorado: cobrança desconhecida')
    expect((await http('POST', '/api/cobranca/webhook', { event: 'ACCOUNT_STATUS_UPDATED', id: novoId('evt') }, undefined, { 'asaas-access-token': TOKEN })).body.resultado).toBe('ignorado: evento sem efeito')
    expect((await http('POST', '/api/cobranca/webhook', 'lixo', undefined, { 'asaas-access-token': TOKEN })).status).toBeLessThan(500)
  })
})
