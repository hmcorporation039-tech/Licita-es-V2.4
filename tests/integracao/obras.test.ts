// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): "Obras e ganhadores" —
// coleta dos contratos (PNCP simulado), cadastro de nichos/região, busca, contato e mensagem.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/perfilDoNegocio', async (original) => ({
  ...(await original<typeof import('../../src/services/perfilDoNegocio')>()),
  consultarCnpj: vi.fn(async (cnpj: string) => ({
    cnpj, razaoSocial: 'CONSTRUTORA CAPIXABA LTDA', nomeFantasia: 'Capixaba Obras', uf: 'ES', municipio: 'Vila Velha', atividades: [],
    telefones: ['(27) 3333-4444'], email: 'contato@capixaba.com.br', situacao: 'ATIVA',
  })),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Obras e ganhadores', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const prefixo = `${sufixo.replace(/\D/g, '').padEnd(8, '7').slice(0, 8)}`
  const idDoContrato = (n: number) => `${prefixo}000100-2-${String(n).padStart(6, '0')}/2026`
  // O coletor trabalha no dia de Brasília (à noite, o dia em UTC já é o seguinte).
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(texto) } catch { /* não é JSON */ }
    return { status: res.status, body }
  }

  async function conta(nome: string, empresa: Record<string, unknown>) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: { email: `obras-${nome}-${sufixo}@teste.local`, passwordHash: await hashPassword(SENHA), emailVerifiedAt: new Date(), company: { create: { name: `Obras ${sufixo} ${nome}`, ...empresa } } },
    })
    return { companyId: u.companyId as string, token: (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string }
  }

  const bruto = (n: number, extra: Record<string, unknown>) => ({
    numeroControlePNCP: idDoContrato(n),
    orgaoEntidade: { cnpj: `${prefixo}000100`, razaoSocial: 'PREFEITURA DE TESTE' },
    unidadeOrgao: { ufSigla: 'ES', municipioNome: 'Vitória', codigoIbge: '3205309' },
    tipoPessoa: 'PJ',
    niFornecedor: '11222333000181',
    nomeRazaoSocialFornecedor: 'CONSTRUTORA CAPIXABA LTDA',
    valorGlobal: 850000,
    categoriaProcesso: { nome: 'Obras' },
    tipoContrato: { nome: 'Contrato (termo inicial)' },
    dataAssinatura: hoje,
    dataPublicacaoPncp: `${hoje}T10:00:00`,
    ...extra,
  })

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
    await prisma.contratoPublico.deleteMany({ where: { id: { startsWith: prefixo } } })
    const empresas = await prisma.company.findMany({ where: { name: { startsWith: `Obras ${sufixo}` } }, select: { id: true } })
    const ids = empresas.map((e: { id: string }) => e.id)
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  }, 60_000)

  it('coleta, cadastra nichos, busca na região e monta contato e mensagem', async () => {
    const { coletarContratosPublicos } = await import('../../src/services/contratosPublicosColeta')
    const paginas: Record<string, unknown[]> = {
      [hoje]: [
        bruto(1, { objetoContrato: 'Execução de obra de construção da escola municipal no bairro Itapuã, em Vila Velha/ES' }),
        bruto(2, { objetoContrato: 'Reforma da unidade de saúde de Linhares/ES' }),
        bruto(3, { objetoContrato: 'Construção de creche em Campinas/SP', unidadeOrgao: { ufSigla: 'SP', municipioNome: 'Campinas', codigoIbge: '3509502' } }),
        bruto(4, { objetoContrato: 'Aquisição de material de construção', categoriaProcesso: { nome: 'Compras' } }),
        bruto(5, { objetoContrato: 'Serviço de limpeza e conservação' }),
      ],
    }
    const r = await coletarContratosPublicos({
      pausaMs: 0,
      maxPaginas: 3,
      buscar: async (dia, pagina) => ({ data: pagina === 1 ? (paginas[dia] ?? []) : [], totalPaginas: 1, totalRegistros: (paginas[dia] ?? []).length }),
    })
    expect(r.falhas).toEqual([])
    expect(await prisma.contratoPublico.count({ where: { id: { startsWith: prefixo } } })).toBe(4)

    // Base em Vitória/ES: Vila Velha (perto) entra; Linhares (~130 km) fica fora de 100 km; Campinas/SP fora.
    const ana = await conta('ana', { baseMunicipio: 'Vitória', baseUf: 'ES', baseLat: -20.3155, baseLng: -40.3128, telefone: '(27) 98888-7777', planCode: 'PROFISSIONAL' })
    const perfil = await http('GET', '/api/obras/perfil', undefined, ana.token)
    expect(perfil.status).toBe(200)
    expect(perfil.body.configurado).toBe(false)
    expect(perfil.body.catalogo.length).toBeGreaterThan(10)
    const eletrica = perfil.body.catalogo.find((n: { id: string }) => n.id === 'eletrica')

    expect((await http('PUT', '/api/obras/perfil', { raioKm: null, ufs: [], nichos: [eletrica] }, ana.token)).status).toBe(400)
    expect((await http('PUT', '/api/obras/perfil', { raioKm: 100, ufs: [], nichos: [eletrica] }, ana.token)).status).toBe(200)

    const ops = await http('GET', '/api/obras/oportunidades', undefined, ana.token)
    expect(ops.status).toBe(200)
    expect(ops.body.planoGratuito).toBeNull()
    const meus = ops.body.contratos.filter((c: { id: string }) => c.id.startsWith(prefixo))
    expect(meus.map((c: { id: string }) => c.id)).toEqual([idDoContrato(1)])
    expect(meus[0]).toMatchObject({ municipio: 'Vila Velha', uf: 'ES', nichos: ['Instalações elétricas'], fornecedor: { cnpj: '11222333000181' } })
    expect(meus[0].distanciaKm).toBeLessThan(30)

    // Estado inteiro: Linhares entra também.
    await http('PUT', '/api/obras/perfil', { raioKm: 100, ufs: ['ES'], nichos: [eletrica] }, ana.token)
    const comEstado = (await http('GET', '/api/obras/oportunidades', undefined, ana.token)).body.contratos.filter((c: { id: string }) => c.id.startsWith(prefixo))
    expect(comEstado.map((c: { id: string }) => c.id).sort()).toEqual([idDoContrato(1), idDoContrato(2)])

    const contato = await http('GET', '/api/obras/ganhador/11.222.333%2F0001-81', undefined, ana.token)
    expect(contato.status).toBe(200)
    expect(contato.body).toMatchObject({ telefones: ['(27) 3333-4444'], email: 'contato@capixaba.com.br', contratosRecentes: 4 })

    const msg = await http('GET', `/api/obras/mensagem/${encodeURIComponent(idDoContrato(1))}`, undefined, ana.token)
    expect(msg.status).toBe(200)
    expect(msg.body.texto).toContain('Olá, equipe da CONSTRUTORA CAPIXABA LTDA.')
    expect(msg.body.texto).toContain(`Somos a Obras ${sufixo} ana, de Vitória/ES`)
    expect(msg.body.texto).toContain('Fico à disposição: (27) 98888-7777.')

    // Outra empresa não vê os nichos da primeira.
    const bia = await conta('bia', {})
    expect((await http('GET', '/api/obras/perfil', undefined, bia.token)).body.nichos).toEqual([])
    expect((await http('GET', '/api/obras/oportunidades', undefined, bia.token)).body).toMatchObject({ configurado: false, contratos: [] })
    expect((await http('GET', '/api/obras/perfil')).status).toBe(401)

    // Plano gratuito (teste): amostra da lista; contato e mensagem só nos planos pagos.
    const caio = await conta('caio', { baseMunicipio: 'Vitória', baseUf: 'ES', baseLat: -20.3155, baseLng: -40.3128 })
    expect((await http('PUT', '/api/obras/perfil', { raioKm: 100, ufs: ['ES'], nichos: [eletrica] }, caio.token)).status).toBe(200)
    const gratis = await http('GET', '/api/obras/oportunidades', undefined, caio.token)
    expect(gratis.status).toBe(200)
    expect(gratis.body.contratos.length).toBeLessThanOrEqual(5)
    expect(gratis.body.planoGratuito).toMatchObject({ mostrados: gratis.body.contratos.length, total: gratis.body.total })
    const semContato = await http('GET', '/api/obras/ganhador/11222333000181', undefined, caio.token)
    expect(semContato.status).toBe(403)
    expect(semContato.body.code).toBe('OBRAS_SO_NOS_PLANOS')
    expect((await http('GET', `/api/obras/mensagem/${encodeURIComponent(idDoContrato(1))}`, undefined, caio.token)).status).toBe(403)

    // O caminho inverso: quem ganhou uma obra em Vila Velha procura eletricista perto dela.
    // Ana aceita aparecer como prestadora; Caio não.
    await http('PUT', '/api/obras/perfil', { raioKm: 100, ufs: ['ES'], nichos: [eletrica], visivelComoPrestador: true, apresentacao: 'Equipe própria, NR-10.' }, ana.token)
    const busca = (token: string, extra = '') => http('GET', `/api/obras/prestadores?servico=eletrica&cidade=Vila%20Velha&uf=ES&raioKm=100${extra}`, undefined, token)
    const achados = await busca(bia.token)
    expect(achados.status).toBe(200)
    expect(achados.body.obra).toMatchObject({ municipio: 'Vila Velha', uf: 'ES' })
    const daAna = achados.body.daBela.filter((p: { id: string }) => p.id === ana.companyId)
    expect(daAna).toHaveLength(1)
    expect(daAna[0]).toMatchObject({ apresentacao: 'Equipe própria, NR-10.', telefone: '(27) 98888-7777', nichos: ['Instalações elétricas'] })
    expect(achados.body.daBela.some((p: { id: string }) => p.id === caio.companyId)).toBe(false)
    // A própria empresa não aparece para si; serviço que ela não faz também não.
    expect((await busca(ana.token)).body.daBela.some((p: { id: string }) => p.id === ana.companyId)).toBe(false)
    expect((await http('GET', '/api/obras/prestadores?servico=pintura&cidade=Vila%20Velha&uf=ES', undefined, bia.token)).body.daBela.some((p: { id: string }) => p.id === ana.companyId)).toBe(false)
    expect((await http('GET', '/api/obras/prestadores?servico=eletrica&cidade=Cidade%20Inventada&uf=ES', undefined, bia.token)).status).toBe(400)
    // Sem a chave do Google, a busca lá avisa que não está ativada.
    const google = await http('GET', '/api/obras/prestadores/google?servico=eletrica&cidade=Vila%20Velha&uf=ES', undefined, ana.token)
    expect(google.status).toBe(503)
    expect(google.body.code).toBe('GOOGLE_NAO_CONFIGURADO')
  })
})
