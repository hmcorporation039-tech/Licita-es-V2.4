import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'
import { lerPlanilha, textoDaColuna, type PlanilhaLida } from '../helpers/planilha'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const TIPO_DO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DIA_MS = 86_400_000

rodar('Exportar para Excel', () => {
  let server: Server
  let base = ''
  let prisma: PrismaClient
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const SENHA = 'Senha-de-teste-123'
  const empresas: string[] = []
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' }
  const ids = { proxima: randomUUID(), obra: randomUUID(), distante: randomUUID(), encerrada: randomUUID(), daOutra: randomUUID() }

  async function baixar(caminho: string, token?: string) {
    const r = await fetch(base + caminho, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const bytes = new Uint8Array(await r.arrayBuffer())
    return { status: r.status, headers: r.headers, bytes }
  }

  async function criarEmpresa(rotulo: 'a' | 'b') {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `exportar-${rotulo}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa Exportar ${rotulo} ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    empresas.push(user.companyId)
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: SENHA }),
    })
    tokens[rotulo] = ((await login.json()) as { token: string }).token
    return user
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.APP_URL = 'https://licitabela.teste'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const a = await criarEmpresa('a')
    const b = await criarEmpresa('b')

    const agora = Date.now()
    const licitacao = (id: string, nome: string, fimEmDias: number, extra: Partial<Prisma.TenderCreateManyInput> = {}): Prisma.TenderCreateManyInput => ({
      id,
      fonte: 'PNCP',
      fonteId: `exportar-${sufixo}-${nome}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: `Aquisição de papel ${nome}`,
      objetoNorm: `aquisicao de papel ${nome}`,
      orgao: 'Prefeitura de Goiânia',
      municipio: 'Goiânia',
      uf: 'GO',
      publicadoAt: new Date(agora - DIA_MS),
      encerramentoAt: new Date(agora + fimEmDias * DIA_MS),
      valorEstimado: '15000.50',
      linkEdital: `https://pncp.gov.br/editais/${nome}`,
      rawJson: {},
      ...extra,
    })
    await prisma.tender.createMany({
      data: [
        licitacao(ids.proxima, 'proxima', 3),
        licitacao(ids.obra, 'obra', 2, { objeto: '=HYPERLINK("http://mal.example","clique")', modalidade: 'CONCORRENCIA' }),
        licitacao(ids.distante, 'distante', 12, { valorEstimado: null }),
        licitacao(ids.encerrada, 'encerrada', -2, { valorHomologado: '14000' }),
        licitacao(ids.daOutra, 'da-outra', 4),
      ],
    })

    const papel = await prisma.monitoredItem.create({ data: { name: 'Papel A4', keywords: ['papel'], userId: a.id, companyId: a.companyId } })
    const envelope = await prisma.monitoredItem.create({ data: { name: 'Envelope', keywords: ['papel'], userId: a.id, companyId: a.companyId } })
    const cimento = await prisma.monitoredItem.create({ data: { name: 'Cimento da B', keywords: ['papel'], userId: b.id, companyId: b.companyId } })

    const match = (tenderId: string, item: { id: string }, dono: { id: string; companyId: string }, extra: Partial<Prisma.TenderMatchCreateManyInput> = {}): Prisma.TenderMatchCreateManyInput => ({
      id: randomUUID(),
      tenderId,
      monitoredItemId: item.id,
      companyId: dono.companyId,
      userId: dono.id,
      score: 0.5,
      matchedKeywords: ['papel'],
      ...extra,
    })
    await prisma.tenderMatch.createMany({
      data: [
        match(ids.proxima, papel, a),
        match(ids.proxima, envelope, a),
        match(ids.obra, papel, a, { dentroDeObraCompleta: true }),
        match(ids.distante, papel, a),
        match(ids.encerrada, papel, a),
        match(ids.proxima, cimento, b),
        match(ids.daOutra, cimento, b),
      ],
    })

    await prisma.tenderParticipationPlan.createMany({
      data: [
        { companyId: a.companyId, userId: a.id, tenderId: ids.proxima, status: 'VOU_PARTICIPAR', state: {} },
        { companyId: a.companyId, userId: a.id, tenderId: ids.encerrada, status: 'PARTICIPEI', state: {} },
        { companyId: b.companyId, userId: b.id, tenderId: ids.daOutra, status: 'AVALIANDO', state: {} },
      ],
    })
  }, 120_000)

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: empresas } } })
      await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `exportar-${sufixo}-` } } })
      for (const id of empresas) await prisma.company.delete({ where: { id } }).catch(() => undefined)
    }
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  function objetos(planilha: PlanilhaLida): string[] {
    return [...textoDaColuna(planilha, 'Objeto').values()]
  }

  it('sem token, as duas exportações respondem 401', async () => {
    expect((await baixar('/api/matches/exportar')).status).toBe(401)
    expect((await baixar('/api/participation-plans/exportar')).status).toBe(401)
  })

  it('matches: uma linha por licitação, só da empresa, no recorte do feed e com prazo mais próximo primeiro', async () => {
    const r = await baixar('/api/matches/exportar', tokens.a)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe(TIPO_DO_XLSX)
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="licita-bela-matches-\d{4}-\d{2}-\d{2}\.xlsx"$/)

    const p = lerPlanilha(r.bytes)
    expect(p.partes).toContain('xl/worksheets/sheet1.xml')
    expect(p.xml['xl/workbook.xml']).toContain('name="Meus matches"')
    expect(objetos(p)).toEqual(['Aquisição de papel proxima', 'Aquisição de papel distante', '=HYPERLINK("http://mal.example","clique")'])
    expect(p.xml['xl/worksheets/sheet1.xml']).not.toMatch(/<f[ >]/)
    expect(p.celulas.get('A4')).toMatchObject({ tipo: 'texto', estilo: 4 })

    const itens = textoDaColuna(p, 'Itens')
    expect(itens.get(2)?.split('; ').sort()).toEqual(['Envelope', 'Papel A4'])
    expect(itens.get(3)).toBe('Papel A4')
    expect([...itens.values()].join(' ')).not.toContain('Cimento')

    expect(textoDaColuna(p, 'Dentro de obra completa').get(2)).toBe('Não')
    expect(textoDaColuna(p, 'Dentro de obra completa').get(4)).toBe('Sim')
    expect(textoDaColuna(p, 'Modalidade').get(4)).toBe('Concorrência')
    expect(textoDaColuna(p, 'Fonte').get(2)).toBe('PNCP')
    expect(textoDaColuna(p, 'Cidade/UF').get(2)).toBe('Goiânia/GO')
    expect(textoDaColuna(p, 'Valor estimado').get(2)).toBe('15000.5')
    expect(p.celulas.get('H2')).toMatchObject({ tipo: 'numero', estilo: 2 })
    expect(textoDaColuna(p, 'Valor estimado').has(3)).toBe(false)
    expect(Number(textoDaColuna(p, 'Nota de aderência').get(2))).toBeGreaterThan(0)
    expect(textoDaColuna(p, 'Prazo para proposta').get(2)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect(textoDaColuna(p, 'Link na Licita Bela').get(2)).toBe(`https://licitabela.teste/tenders/${ids.proxima}`)
    expect(textoDaColuna(p, 'Link do edital').get(2)).toBe('https://pncp.gov.br/editais/proxima')

    const auditoria = await prisma.auditLog.findFirst({ where: { companyId: empresas[0], action: 'EXPORTACAO_PLANILHA' }, orderBy: { createdAt: 'desc' } })
    expect(auditoria?.metadata).toEqual({ tipo: 'matches', linhas: 3 })
  })

  it('matches da outra empresa não aparecem e ela vê só os dela', async () => {
    const p = lerPlanilha((await baixar('/api/matches/exportar', tokens.b)).bytes)
    expect(objetos(p).sort()).toEqual(['Aquisição de papel da-outra', 'Aquisição de papel proxima'])
    expect([...textoDaColuna(p, 'Itens').values()]).toEqual(['Cimento da B', 'Cimento da B'])
  })

  it('escolhidas: todas as situações do plano da empresa, com valor homologado', async () => {
    const r = await baixar('/api/participation-plans/exportar', tokens.a)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe(TIPO_DO_XLSX)
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="licita-bela-escolhidas-\d{4}-\d{2}-\d{2}\.xlsx"$/)

    const p = lerPlanilha(r.bytes)
    const situacaoPorObjeto = new Map<string, string>()
    const situacoes = textoDaColuna(p, 'Situação do plano')
    for (const [linha, objeto] of textoDaColuna(p, 'Objeto')) situacaoPorObjeto.set(objeto, situacoes.get(linha) ?? '')
    expect(Object.fromEntries(situacaoPorObjeto)).toEqual({
      'Aquisição de papel proxima': 'Vou participar',
      'Aquisição de papel encerrada': 'Participei',
    })
    const homologados = [...textoDaColuna(p, 'Valor homologado').values()]
    expect(homologados).toEqual(['14000'])

    const auditoria = await prisma.auditLog.findFirst({ where: { companyId: empresas[0], action: 'EXPORTACAO_PLANILHA', metadata: { path: ['tipo'], equals: 'escolhidas' } } })
    expect(auditoria?.metadata).toEqual({ tipo: 'escolhidas', linhas: 2 })
  })

  it('escolhidas da outra empresa não aparecem', async () => {
    const p = lerPlanilha((await baixar('/api/participation-plans/exportar', tokens.b)).bytes)
    expect(objetos(p)).toEqual(['Aquisição de papel da-outra'])
    expect(textoDaColuna(p, 'Situação do plano').get(2)).toBe('Avaliando')
  })
})
