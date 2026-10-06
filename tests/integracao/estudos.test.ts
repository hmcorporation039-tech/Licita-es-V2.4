// ============================================================
// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): estudo de custos da
// licitação escolhida — acesso, isolamento entre empresas, cálculo, gravação e PDF.
// ============================================================

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Estudo de custos', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-forte-123'
  const futuro = new Date(Date.now() + 10 * 86_400_000)

  let tokenA = ''
  let tokenB = ''
  let companyA = ''
  let tenderId = ''
  let tenderSemEscolha = ''
  let itemCatmat = ''
  let itemSemCodigo = ''

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(buf.toString('utf8')) } catch { /* não é JSON */ }
    return { status: res.status, body, buf, headers: res.headers }
  }

  async function criarConta(nome: string, extraEmpresa: Record<string, unknown> = {}) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${nome}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${nome} ${sufixo}`, ...extraEmpresa } },
      },
    })
    const token = (await http('POST', '/api/auth/login', { email: u.email, password: SENHA })).body.token as string
    return { userId: u.id as string, companyId: u.companyId as string, token }
  }

  const dadosBase = (itens: Record<string, { custoUnit: number | null; precoVendaUnit: number | null }>) => ({
    versao: 1,
    itens,
    mercado: {},
    deslocamento: { kmIdaInformado: null, viagens: 1, valorPorKm: 2, pedagioPorViagem: 50, hospedagemPorViagem: 0 },
    impostosPct: 10,
    margemDesejadaPct: 10,
    outrosCustos: [],
    prazo: { exigidoDias: 30, exigidoEmDiasUteis: false, preparoDias: 10, assinatura: null },
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

    // Empresa A: base em Goiânia/GO (as coordenadas vêm da base do IBGE).
    const a = await criarConta('estudoa')
    tokenA = a.token
    companyA = a.companyId
    const patch = await http('PATCH', '/api/company', { baseMunicipio: 'Goiânia', baseUf: 'GO' }, tokenA)
    expect(patch.status).toBe(200)
    const b = await criarConta('estudob')
    tokenB = b.token

    const tender = await prisma.tender.create({
      data: {
        fonte: 'FIEG', fonteId: `estudo-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `Aquisição de equipamentos ${sufixo}`, objetoNorm: `aquisicao de equipamentos ${sufixo}`,
        valorEstimado: 50000, municipio: 'Anápolis', uf: 'GO', encerramentoAt: futuro, rawJson: {},
        items: {
          create: [
            { numeroItem: 1, descricao: 'Notebook', quantidade: 10, valorUnitario: 4000, valorTotal: 40000, unidadeMedida: 'UN', catmatCode: '150227' },
            { numeroItem: 2, descricao: 'Mouse', quantidade: 20, valorUnitario: 500, valorTotal: 10000, unidadeMedida: 'UN' },
          ],
        },
        analysis: { create: { status: 'DONE', resultado: { prazoEntrega: 'Até 20 dias corridos após a ordem de fornecimento' } } },
      },
      include: { items: true },
    })
    tenderId = tender.id
    itemCatmat = tender.items.find((i: { catmatCode: string | null }) => i.catmatCode)!.id
    itemSemCodigo = tender.items.find((i: { catmatCode: string | null }) => !i.catmatCode)!.id
    const outra = await prisma.tender.create({
      data: { fonte: 'FIEG', fonteId: `estudo2-${sufixo}`, modalidade: 'CONVITE', situacao: 'ABERTA', objeto: `Outra ${sufixo}`, encerramentoAt: futuro, rawJson: {} },
    })
    tenderSemEscolha = outra.id
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  async function marcar(status: string, token = tokenA, id = tenderId) {
    return http('PATCH', `/api/tenders/${id}/plano/status`, { status }, token)
  }

  it('só licitações marcadas como "Vou participar" têm estudo', async () => {
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).status).toBe(409) // ainda não escolhida
    expect((await marcar('AVALIANDO')).status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).status).toBe(409)
    expect((await marcar('VOU_PARTICIPAR')).status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderSemEscolha}`, undefined, tokenA)).status).toBe(409)
    expect((await http('GET', `/api/estudos/${randomUUID()}`, undefined, tokenA)).status).toBe(404)
    expect((await http('GET', `/api/estudos/${tenderId}`)).status).toBe(401)
  })

  it('abre com os itens, a distância da base até o local e o prazo lido do edital', async () => {
    const r = await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)
    expect(r.body.itens.map((i: { descricao: string }) => i.descricao)).toEqual(['Notebook', 'Mouse'])
    expect(r.body.itens[0]).toMatchObject({ quantidade: 10, valorEstimadoUnit: 4000, codigoCatalogo: '150227', tipoCatalogo: 'MATERIAL' })
    expect(r.body.itens[1].tipoCatalogo).toBeNull()
    expect(r.body.base).toMatchObject({ municipio: 'Goiânia', uf: 'GO', definida: true })
    expect(r.body.distanciaLinhaRetaKm).toBeGreaterThan(40) // Goiânia -> Anápolis ~ 50 km
    expect(r.body.distanciaLinhaRetaKm).toBeLessThan(70)
    expect(r.body.dados.prazo).toMatchObject({ exigidoDias: 20, exigidoEmDiasUteis: false }) // "20 dias corridos"
    expect(r.body.salvoEm).toBeNull()
  })

  it('calcula sem gravar, e grava só o que o usuário digitou', async () => {
    const dados = dadosBase({ [itemCatmat]: { custoUnit: 3000, precoVendaUnit: 3800 }, [itemSemCodigo]: { custoUnit: 300, precoVendaUnit: 450 } })
    const calc = await http('POST', `/api/estudos/${tenderId}/calcular`, { dados }, tokenA)
    expect(calc.status).toBe(200)
    expect(calc.body.resultado.receita).toBe(10 * 3800 + 20 * 450) // 47000
    expect(calc.body.resultado.custoItens).toBe(10 * 3000 + 20 * 300) // 36000
    expect(calc.body.resultado.deslocamento.origem).toBe('estimado')
    expect(await prisma.costStudy.count({ where: { companyId: companyA } })).toBe(0) // não gravou

    const salvo = await http('PUT', `/api/estudos/${tenderId}`, { dados }, tokenA)
    expect(salvo.status).toBe(200)
    expect(salvo.body.salvoEm).not.toBeNull()
    expect(salvo.body.resultado.lucro).toBe(calc.body.resultado.lucro)
    const guardado = await prisma.costStudy.findFirst({ where: { companyId: companyA } })
    expect(guardado.dados).not.toHaveProperty('resultado') // o resultado nunca é gravado
    expect(await prisma.auditLog.count({ where: { companyId: companyA, action: 'ESTUDO_SALVO' } })).toBe(1)

    const releitura = await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)
    expect(releitura.body.dados.itens[itemCatmat]).toEqual({ custoUnit: 3000, precoVendaUnit: 3800 })
    expect(releitura.body.dados.prazo.exigidoDias).toBe(30) // o que o usuário gravou vale mais que o texto do edital
  })

  it('recusa dados inválidos (valor negativo, imposto acima de 100%, texto no lugar de número)', async () => {
    const ruim = (alt: Record<string, unknown>) => ({ ...dadosBase({}), ...alt })
    for (const dados of [ruim({ impostosPct: 120 }), ruim({ itens: { x: { custoUnit: -1, precoVendaUnit: 1 } } }), ruim({ margemDesejadaPct: 'dez' }), ruim({ versao: 2 })]) {
      expect((await http('POST', `/api/estudos/${tenderId}/calcular`, { dados }, tokenA)).status).toBe(400)
    }
  })

  it('outra empresa não vê nem grava o estudo da empresa A', async () => {
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenB)).status).toBe(409) // B não escolheu esta licitação
    expect((await http('PUT', `/api/estudos/${tenderId}`, { dados: dadosBase({}) }, tokenB)).status).toBe(409)
    expect((await http('GET', `/api/estudos/${tenderId}/pdf`, undefined, tokenB)).status).toBe(409)
    // Mesmo B escolhendo a mesma licitação, o estudo dele começa vazio (não herda o de A).
    expect((await marcar('VOU_PARTICIPAR', tokenB)).status).toBe(200)
    const b = await http('GET', `/api/estudos/${tenderId}`, undefined, tokenB)
    expect(b.status).toBe(200)
    expect(b.body.dados.itens).toEqual({})
    expect(b.body.salvoEm).toBeNull()
    expect(b.body.base.definida).toBe(false) // B não cadastrou base: sem distância
    expect(b.body.distanciaLinhaRetaKm).toBeNull()
  })

  it('pesquisa de preços: item sem código dá 422 claro; item inexistente 404', async () => {
    const sem = await http('POST', `/api/estudos/${tenderId}/precos`, { itemId: itemSemCodigo }, tokenA)
    expect(sem.status).toBe(422)
    expect(sem.body.error).toMatch(/CATMAT/)
    expect((await http('POST', `/api/estudos/${tenderId}/precos`, { itemId: randomUUID() }, tokenA)).status).toBe(404)
  })

  it('gera o PDF com o que está salvo e registra na auditoria', async () => {
    const r = await http('GET', `/api/estudos/${tenderId}/pdf`, undefined, tokenA)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/pdf')
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="dossie-da-licitacao-/)
    expect(r.buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await prisma.auditLog.count({ where: { companyId: companyA, action: 'ESTUDO_PDF_GERADO' } })).toBe(1)
  })

  it('sair da lista de escolhidas bloqueia o estudo de novo, mas o que foi salvo continua guardado', async () => {
    expect((await marcar('NAO_VOU_PARTICIPAR')).status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).status).toBe(409)
    expect(await prisma.costStudy.count({ where: { companyId: companyA } })).toBe(1)
    expect((await marcar('VOU_PARTICIPAR')).status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).body.salvoEm).not.toBeNull()
  })

  it('base da empresa: cidade inexistente é recusada; limpar remove a base', async () => {
    const ruim = await http('PATCH', '/api/company', { baseMunicipio: 'Cidade Que Nao Existe', baseUf: 'GO' }, tokenA)
    expect(ruim.status).toBe(400)
    const limpa = await http('PATCH', '/api/company', { baseMunicipio: null, baseUf: null }, tokenA)
    expect(limpa.status).toBe(200)
    expect((await http('GET', `/api/estudos/${tenderId}`, undefined, tokenA)).body.base.definida).toBe(false)
  })
})
