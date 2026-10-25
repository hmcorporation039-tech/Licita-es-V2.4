// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): base de preços
// da empresa — CRUD, busca, "desatualizado" (>90 dias), isolamento por empresa
// e o ciclo exportar → importar planilha.
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gerarPlanilhaXlsx } from '../../src/lib/planilhaXlsx'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Base de preços', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  let tokenA = ''
  let tokenB = ''

  async function tokenDeEmpresa(rotulo: string): Promise<string> {
    const { hashPassword } = await import('../../src/services/authService')
    const email = `bp-${rotulo}-${sufixo}@teste.local`
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `E ${rotulo} ${sufixo}` } } },
    })
    const r = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Senha-forte-123' }) })).json()) as { token: string }
    return r.token
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
    tokenA = await tokenDeEmpresa('a')
    tokenB = await tokenDeEmpresa('b')
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })

  interface PrecoNaTela {
    id: string
    descricao: string
    custoUnitario: string
    tipo: string
    fonte: string
    desatualizado: boolean
  }

  it('cria, lista, busca, atualiza e remove', async () => {
    const criado = (await (await fetch(`${base}/api/base-de-precos`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ descricao: `Cimento CP-II ${sufixo}`, unidade: 'sc', tipo: 'MATERIAL', custoUnitario: 32.9, fonte: 'PROPRIA' }),
    })).json()) as PrecoNaTela
    expect(criado.custoUnitario).toBe('32.90')
    expect(criado.desatualizado).toBe(false)

    const lista = (await (await fetch(`${base}/api/base-de-precos?q=cimento ${sufixo}`, { headers: auth(tokenA) })).json()) as PrecoNaTela[]
    expect(lista.map((p) => p.id)).toContain(criado.id)

    const atualizado = (await (await fetch(`${base}/api/base-de-precos/${criado.id}`, {
      method: 'PUT',
      headers: auth(tokenA),
      body: JSON.stringify({ descricao: `Cimento CP-II ${sufixo}`, unidade: 'sc', tipo: 'MATERIAL', custoUnitario: 35, fonte: 'PROPRIA' }),
    })).json()) as PrecoNaTela
    expect(atualizado.custoUnitario).toBe('35.00')

    const del = await fetch(`${base}/api/base-de-precos/${criado.id}`, { method: 'DELETE', headers: auth(tokenA) })
    expect(del.status).toBe(204)
  })

  it('marca preço com mais de 90 dias como desatualizado', async () => {
    const antigo = new Date(Date.now() - 100 * 86_400_000).toISOString()
    const criado = (await (await fetch(`${base}/api/base-de-precos`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ descricao: `Vergalhão ${sufixo}`, tipo: 'MATERIAL', custoUnitario: 10, dataDoPreco: antigo }),
    })).json()) as PrecoNaTela
    expect(criado.desatualizado).toBe(true)
  })

  it('a empresa B não vê o preço da empresa A, nem edita/remove', async () => {
    const criado = (await (await fetch(`${base}/api/base-de-precos`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ descricao: `Privado ${sufixo}`, tipo: 'SERVICO', custoUnitario: 99 }),
    })).json()) as PrecoNaTela

    const listaB = (await (await fetch(`${base}/api/base-de-precos?q=privado ${sufixo}`, { headers: auth(tokenB) })).json()) as PrecoNaTela[]
    expect(listaB.find((p) => p.id === criado.id)).toBeUndefined()

    const putB = await fetch(`${base}/api/base-de-precos/${criado.id}`, { method: 'PUT', headers: auth(tokenB), body: JSON.stringify({ descricao: 'x', tipo: 'MATERIAL', custoUnitario: 1 }) })
    expect(putB.status).toBe(404)
  })

  it('exporta e importa a planilha de volta (ciclo completo)', async () => {
    const exp = await fetch(`${base}/api/base-de-precos/exportar`, { headers: { Authorization: `Bearer ${tokenB}` } })
    expect(exp.status).toBe(200)
    expect(exp.headers.get('content-type')).toContain('spreadsheetml')

    const xlsx = gerarPlanilhaXlsx({
      nomeDaAba: 'Base de preços',
      colunas: [
        { titulo: 'Descrição', largura: 40 },
        { titulo: 'Unidade', largura: 10 },
        { titulo: 'Tipo', largura: 14 },
        { titulo: 'Custo unitário', largura: 14, tipo: 'moeda' },
        { titulo: 'Fonte', largura: 12 },
        { titulo: 'Observação', largura: 30 },
      ],
      linhas: [
        [`Tijolo ${sufixo}`, 'mil', 'Material', 1200.5, 'Própria', ''],
        [`Pedreiro ${sufixo}`, 'h', 'Mão de obra', 28, 'Referência', 'SINAPI'],
        ['', '', 'Material', '', '', 'linha vazia ignorada'],
      ],
    })

    const imp = (await (await fetch(`${base}/api/base-de-precos/importar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(xlsx),
    })).json()) as { importados: number; ignorados: number }
    expect(imp.importados).toBe(2)

    const lista = (await (await fetch(`${base}/api/base-de-precos?q=${sufixo}`, { headers: { Authorization: `Bearer ${tokenB}` } })).json()) as PrecoNaTela[]
    const pedreiro = lista.find((p) => p.descricao === `Pedreiro ${sufixo}`)
    expect(pedreiro?.tipo).toBe('MAO_DE_OBRA')
    expect(pedreiro?.fonte).toBe('REFERENCIA')
    expect(pedreiro?.custoUnitario).toBe('28.00')
    expect(lista.find((p) => p.descricao === `Tijolo ${sufixo}`)?.custoUnitario).toBe('1200.50')
  })

  it('recusa importar o que não é planilha', async () => {
    const r = await fetch(`${base}/api/base-de-precos/importar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('isto nao e um xlsx'),
    })
    expect(r.status).toBe(422)
  })

  it('sugere o custo dos itens do estudo a partir da base (Agente de Orçamento)', async () => {
    const empresaA = await prisma.user.findFirst({ where: { email: `bp-a-${sufixo}@teste.local` }, select: { id: true, companyId: true } })

    // Cadastra via API para a descricaoNorm usar a mesma normalização do match.
    await fetch(`${base}/api/base-de-precos`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ descricao: `Cimento Portland CP II 50 kg ${sufixo}`, tipo: 'MATERIAL', custoUnitario: 34, fonte: 'PROPRIA' }),
    })

    const tender = await prisma.tender.create({
      data: {
        fonte: 'PNCP', fonteId: `estudo-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
        objeto: `obra ${sufixo}`, objetoNorm: `obra ${sufixo}`, encerramentoAt: new Date(Date.now() + 5 * 86_400_000), uf: 'SP', rawJson: {},
        items: {
          create: [
            { numeroItem: 1, descricao: `Cimento Portland CP II 50 kg ${sufixo}`, quantidade: '10', valorUnitario: '40' },
            { numeroItem: 2, descricao: `Serviço de pintura acrílica ${sufixo}`, quantidade: '5', valorUnitario: '25' },
          ],
        },
      },
      include: { items: { orderBy: { numeroItem: 'asc' } } },
    })
    await prisma.tenderParticipationPlan.create({
      data: { companyId: empresaA.companyId, userId: empresaA.id, tenderId: tender.id, status: 'VOU_PARTICIPAR', state: { doneIds: [], custom: [] } },
    })

    const r = (await (await fetch(`${base}/api/estudos/${tender.id}/custos-da-base`, { method: 'POST', headers: auth(tokenA) })).json()) as {
      encontrados: number
      sugestoes: Record<string, { custoUnit: number; fonte: string }>
    }
    const cimento = tender.items.find((i: { id: string; numeroItem: number | null }) => i.numeroItem === 1)!
    const pintura = tender.items.find((i: { id: string; numeroItem: number | null }) => i.numeroItem === 2)!
    expect(r.sugestoes[cimento.id]?.custoUnit).toBe(34)
    expect(r.sugestoes[cimento.id]?.fonte).toBe('PROPRIA')
    expect(r.sugestoes[pintura.id]).toBeUndefined() // não há pintura na base
  })
})
