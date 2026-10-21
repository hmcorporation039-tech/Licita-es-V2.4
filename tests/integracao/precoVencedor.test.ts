import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { BuscarListaNoPncp, OpcoesDosResultados, ResumoDosResultados } from '../../src/services/resultadoDasLicitacoes'
import { lerPlanilha, textoDaColuna } from '../helpers/planilha'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const DIA_MS = 86_400_000
const HORA_MS = 3_600_000
const AGORA = new Date('2021-03-01T12:00:00.000Z')
const SEM_CANCELAMENTO = '0001-01-01T00:00:00'

rodar('Preço vencedor: resultado das licitações do PNCP', () => {
  let server: Server
  let base = ''
  let prisma: PrismaClient
  let conferir: (opcoes?: OpcoesDosResultados) => Promise<ResumoDosResultados>
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const cnpj = String(10_000_000_000_000 + Math.floor(Math.random() * 89_999_999_999_999)).slice(0, 14)
  const SENHA = 'Senha-de-teste-123'
  const empresas: string[] = []
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' }
  const usuarios: Record<'a' | 'b', { id: string; companyId: string }> = { a: { id: '', companyId: '' }, b: { id: '', companyId: '' } }
  const ids = { comMatch: randomUUID(), comPlano: randomUUID(), semInteresse: randomUUID(), antiga: randomUUID(), noTeto: randomUUID(), comErro: randomUUID(), depoisDoErro: randomUUID(), semItens: randomUUID() }
  const sequenciais: Record<keyof typeof ids, number> = { comMatch: 11, comPlano: 12, semInteresse: 13, antiga: 14, noTeto: 15, comErro: 16, depoisDoErro: 17, semItens: 18 }

  const respostas = new Map<string, unknown[] | Error>()
  const chamadas: string[] = []
  const buscar: BuscarListaNoPncp = async <T>(caminho: string, parametros?: Record<string, number>) => {
    const chave = parametros?.pagina ? `${caminho}?pagina=${parametros.pagina}` : caminho
    chamadas.push(chave)
    const resposta = respostas.get(chave)
    if (resposta instanceof Error) throw resposta
    return (resposta ?? []) as T[]
  }

  const caminho = (nome: keyof typeof ids) => `/v1/orgaos/${cnpj}/compras/2021/${sequenciais[nome]}`
  const listaDeItens = (nome: keyof typeof ids) => `${caminho(nome)}/itens?pagina=1`
  const resultadosDoItem = (nome: keyof typeof ids, numero: number) => `${caminho(nome)}/itens/${numero}/resultados`
  const chamadasDa = (nome: keyof typeof ids) => chamadas.filter((c) => c.startsWith(`${caminho(nome)}/`))

  const itemDoPncp = (numeroItem: number, situacaoCompraItemNome: string, temResultado: boolean) => ({
    numeroItem,
    descricao: `FEIJÃO CARIOCA ITEM ${numeroItem}`,
    informacaoComplementar: `Tipo 1, pacote de 1 kg, item ${numeroItem}`,
    criterioJulgamentoNome: 'Menor preço',
    materialOuServico: 'M',
    catalogoCodigoItem: `4500${numeroItem}`,
    unidadeMedida: 'Pacote',
    quantidade: 100,
    valorTotal: 250,
    temResultado,
    situacaoCompraItem: situacaoCompraItemNome === 'Em andamento' ? 1 : situacaoCompraItemNome === 'Homologado' ? 2 : 4,
    situacaoCompraItemNome,
    valorUnitarioEstimado: 2.5,
  })

  const resultado = (extra: Record<string, unknown>) => ({
    niFornecedor: '52112156000168',
    tipoPessoa: 'PJ',
    nomeRazaoSocialFornecedor: 'MERCEARIA SO MERENDAS LTDA',
    valorTotalHomologado: 1194.0,
    quantidadeHomologada: 600.0,
    valorUnitarioHomologado: 1.99,
    ordemClassificacaoSrp: 1,
    dataResultado: '2021-02-20',
    dataCancelamento: SEM_CANCELAMENTO,
    porteFornecedorNome: 'ME',
    situacaoCompraItemResultadoId: 1,
    situacaoCompraItemResultadoNome: 'Informado',
    sequencialResultado: 1,
    ...extra,
  })

  async function obter(rota: string, token: string) {
    const r = await fetch(base + rota, { headers: { Authorization: `Bearer ${token}` } })
    return { status: r.status, corpo: r.headers.get('content-type')?.includes('json') ? await r.json() : null, bytes: r.headers.get('content-type')?.includes('json') ? null : new Uint8Array(await r.arrayBuffer()) }
  }

  async function criarEmpresa(rotulo: 'a' | 'b') {
    const { hashPassword } = await import('../../src/services/authService')
    const user = await prisma.user.create({
      data: {
        email: `preco-${rotulo}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa Preço ${rotulo} ${sufixo}`, planCode: 'EMPRESARIAL' } },
      },
    })
    empresas.push(user.companyId)
    usuarios[rotulo] = { id: user.id, companyId: user.companyId }
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: SENHA }),
    })
    tokens[rotulo] = ((await login.json()) as { token: string }).token
  }

  function licitacao(nome: keyof typeof ids, encerramentoAt: Date, extra: Partial<Prisma.TenderCreateManyInput> = {}): Prisma.TenderCreateManyInput {
    return {
      id: ids[nome],
      fonte: 'PNCP',
      fonteId: `preco-${sufixo}-${nome}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ENCERRADA',
      objeto: `Aquisição de merenda ${nome}`,
      objetoNorm: `aquisicao de merenda ${nome}`,
      orgao: 'Prefeitura de Teste',
      orgaoCnpj: cnpj,
      uf: 'GO',
      publicadoAt: new Date(encerramentoAt.getTime() - 10 * DIA_MS),
      encerramentoAt,
      valorEstimado: '5000',
      rawJson: { anoCompra: 2021, sequencialCompra: sequenciais[nome], orgaoEntidade: { cnpj } },
      ...extra,
    }
  }

  function itemNoBanco(tenderId: string, numeroItem: number, valorUnitario = '2.5', quantidade = '600'): Prisma.TenderItemCreateManyInput {
    return { tenderId, numeroItem, descricao: `Item ${numeroItem} de merenda escolar`, quantidade, valorUnitario, valorTotal: String(Number(valorUnitario) * Number(quantidade)) }
  }

  async function itensGravados(tenderId: string) {
    const itens = await prisma.tenderItem.findMany({ where: { tenderId }, orderBy: { numeroItem: 'asc' } })
    return new Map(itens.map((i) => [i.numeroItem, i]))
  }

  async function criarMatch(tenderId: string, rotulo: 'a' | 'b') {
    const dono = usuarios[rotulo]
    const item = await prisma.monitoredItem.create({ data: { name: `Merenda ${rotulo} ${randomUUID().slice(0, 4)}`, keywords: ['merenda'], userId: dono.id, companyId: dono.companyId } })
    await prisma.tenderMatch.create({ data: { tenderId, monitoredItemId: item.id, companyId: dono.companyId, userId: dono.id, score: 0.6, matchedKeywords: ['merenda'] } })
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.APP_URL = 'https://licitabela.teste'

    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ conferirResultadosDasLicitacoes: conferir } = await import('../../src/services/resultadoDasLicitacoes'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    await criarEmpresa('a')
    await criarEmpresa('b')

    await prisma.tender.createMany({
      data: [
        licitacao('comMatch', new Date(AGORA.getTime() - 20 * DIA_MS)),
        licitacao('comPlano', new Date(AGORA.getTime() - 15 * DIA_MS)),
        licitacao('semInteresse', new Date(AGORA.getTime() - 25 * DIA_MS)),
        licitacao('antiga', new Date(AGORA.getTime() - 200 * DIA_MS)),
      ],
    })
    await prisma.tenderItem.createMany({
      data: [
        itemNoBanco(ids.comMatch, 1),
        itemNoBanco(ids.comMatch, 2, '10', '100'),
        itemNoBanco(ids.comMatch, 3),
        itemNoBanco(ids.comMatch, 9),
        itemNoBanco(ids.comPlano, 1),
        itemNoBanco(ids.comPlano, 2),
        itemNoBanco(ids.semInteresse, 1),
        itemNoBanco(ids.antiga, 1),
      ],
    })
    await criarMatch(ids.comMatch, 'a')
    await criarMatch(ids.antiga, 'a')
    await prisma.tenderParticipationPlan.createMany({
      data: [
        { companyId: usuarios.a.companyId, userId: usuarios.a.id, tenderId: ids.comPlano, status: 'VOU_PARTICIPAR', state: {} },
        { companyId: usuarios.a.companyId, userId: usuarios.a.id, tenderId: ids.comMatch, status: 'PARTICIPEI', state: {} },
      ],
    })

    respostas.set(listaDeItens('comMatch'), [itemDoPncp(1, 'Homologado', true), itemDoPncp(2, 'Homologado', true), itemDoPncp(3, 'Deserto', false), itemDoPncp(4, 'Homologado', true)])
    respostas.set(resultadosDoItem('comMatch', 1), [resultado({})])
    respostas.set(resultadosDoItem('comMatch', 2), [
      resultado({ niFornecedor: '11111111000111', nomeRazaoSocialFornecedor: 'SEGUNDA COLOCADA LTDA', ordemClassificacaoSrp: 2, sequencialResultado: 2, valorUnitarioHomologado: 8.5, valorTotalHomologado: 850, quantidadeHomologada: 100 }),
      resultado({ niFornecedor: '22222222000122', nomeRazaoSocialFornecedor: 'ALIMENTAÃ‡ÃƒO BOA COMÃ‰RCIO LTDA', porteFornecedorNome: 'EPP', ordemClassificacaoSrp: 1, sequencialResultado: 3, valorUnitarioHomologado: 8, valorTotalHomologado: 800, quantidadeHomologada: 100 }),
      resultado({ niFornecedor: '33333333000133', nomeRazaoSocialFornecedor: 'CANCELADA LTDA', ordemClassificacaoSrp: 1, sequencialResultado: 1, dataCancelamento: '2021-02-25T10:00:00' }),
    ])
    respostas.set(resultadosDoItem('comMatch', 4), [resultado({ niFornecedor: '77777777000177', nomeRazaoSocialFornecedor: 'ITEM QUE FALTAVA LTDA', valorUnitarioHomologado: 3, quantidadeHomologada: 100, valorTotalHomologado: 300 })])
    respostas.set(listaDeItens('comPlano'), [itemDoPncp(1, 'Homologado', true), itemDoPncp(2, 'Em andamento', false)])
    respostas.set(resultadosDoItem('comPlano', 1), [resultado({ niFornecedor: '44444444000144', nomeRazaoSocialFornecedor: 'DISTRIBUIDORA DO PLANO LTDA', valorUnitarioHomologado: 2, valorTotalHomologado: 1200 })])
    respostas.set(listaDeItens('semInteresse'), [itemDoPncp(1, 'Homologado', true)])
    respostas.set(listaDeItens('antiga'), [itemDoPncp(1, 'Homologado', true)])
  }, 120_000)

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: empresas } } })
      await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `preco-${sufixo}-` } } })
      for (const id of empresas) await prisma.company.delete({ where: { id } }).catch(() => undefined)
    }
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('grava o vencedor de cada item, marca resultado final e HOMOLOGADA, e só mexe em licitação com match ou plano', async () => {
    const resumo = await conferir({ agora: AGORA, teto: 100, buscar })
    expect(resumo).toMatchObject({ pulada: false, parouNoTeto: false, falhas: [] })

    const itens = await itensGravados(ids.comMatch)
    expect(itens.get(1)).toMatchObject({ situacaoDoResultado: 'Homologado', vencedorNi: '52112156000168', vencedorNome: 'MERCEARIA SO MERENDAS LTDA', vencedorPorte: 'ME', fornecedoresRegistrados: 1 })
    expect(Number(itens.get(1)?.valorUnitarioHomologado)).toBe(1.99)
    expect(Number(itens.get(1)?.quantidadeHomologada)).toBe(600)
    expect(Number(itens.get(1)?.valorTotalHomologado)).toBe(1194)
    expect(itens.get(1)?.dataDoResultado?.toISOString()).toBe('2021-02-20T00:00:00.000Z')
    expect(itens.get(2)).toMatchObject({ vencedorNi: '22222222000122', vencedorNome: 'ALIMENTAÇÃO BOA COMÉRCIO LTDA', vencedorPorte: 'EPP', fornecedoresRegistrados: 2 })
    expect(Number(itens.get(2)?.valorUnitarioHomologado)).toBe(8)
    expect(itens.get(3)).toMatchObject({ situacaoDoResultado: 'Deserto', vencedorNome: null })
    expect(itens.get(9)).toMatchObject({ situacaoDoResultado: null, vencedorNome: null })
    expect(itens.get(4)).toMatchObject({
      descricao: 'FEIJÃO CARIOCA ITEM 4',
      descricaoNorm: 'feijao carioca item 4',
      descricaoDetalhada: 'Tipo 1, pacote de 1 kg, item 4',
      catmatCode: '45004',
      unidadeMedida: 'Pacote',
      situacaoDoResultado: 'Homologado',
      vencedorNome: 'ITEM QUE FALTAVA LTDA',
    })
    expect(Number(itens.get(4)?.valorUnitario)).toBe(2.5)
    expect(itens.get(1)?.descricao).toBe('Item 1 de merenda escolar')
    expect(itens.size).toBe(5)
    expect(resumo.itensCriados).toBeGreaterThanOrEqual(1)

    const comMatch = await prisma.tender.findUniqueOrThrow({ where: { id: ids.comMatch } })
    expect(comMatch.resultadoFinal).toBe(true)
    expect(comMatch.situacao).toBe('HOMOLOGADA')
    expect(Number(comMatch.valorHomologado)).toBe(2294)
    expect(comMatch.resultadoConferidoEm?.toISOString()).toBe(AGORA.toISOString())
    expect(chamadasDa('comMatch')).not.toContain(resultadosDoItem('comMatch', 3))
    expect(chamadasDa('comMatch')).toContain(resultadosDoItem('comMatch', 4))

    const comPlano = await prisma.tender.findUniqueOrThrow({ where: { id: ids.comPlano } })
    expect(comPlano).toMatchObject({ resultadoFinal: false, situacao: 'ENCERRADA', valorHomologado: null })
    expect(comPlano.resultadoConferidoEm?.toISOString()).toBe(AGORA.toISOString())
    expect((await itensGravados(ids.comPlano)).get(1)).toMatchObject({ vencedorNome: 'DISTRIBUIDORA DO PLANO LTDA', situacaoDoResultado: 'Homologado' })
    expect((await itensGravados(ids.comPlano)).get(2)).toMatchObject({ situacaoDoResultado: 'Em andamento', vencedorNome: null })

    expect(chamadasDa('semInteresse')).toEqual([])
    expect(chamadasDa('antiga')).toEqual([])
    const semInteresse = await prisma.tender.findUniqueOrThrow({ where: { id: ids.semInteresse } })
    expect(semInteresse).toMatchObject({ resultadoConferidoEm: null, resultadoFinal: false, situacao: 'ENCERRADA' })
    expect((await itensGravados(ids.semInteresse)).get(1)).toMatchObject({ situacaoDoResultado: null, vencedorNome: null })
  })

  it('não reconfere antes de 12 h, não busca de novo vencedor já gravado e finaliza quando o item sai', async () => {
    chamadas.length = 0
    await conferir({ agora: new Date(AGORA.getTime() + HORA_MS), teto: 100, buscar })
    expect(chamadasDa('comPlano')).toEqual([])
    expect(chamadasDa('comMatch')).toEqual([])

    respostas.set(listaDeItens('comPlano'), [itemDoPncp(1, 'Homologado', true), itemDoPncp(2, 'Homologado', true)])
    respostas.set(resultadosDoItem('comPlano', 2), [resultado({ niFornecedor: '55555555000155', nomeRazaoSocialFornecedor: 'OUTRA DO PLANO LTDA', valorTotalHomologado: 900 })])
    await conferir({ agora: new Date(AGORA.getTime() + 13 * HORA_MS), teto: 100, buscar })
    expect(chamadasDa('comPlano')).toEqual([listaDeItens('comPlano'), resultadosDoItem('comPlano', 2)])
    expect(chamadasDa('comMatch')).toEqual([])

    const comPlano = await prisma.tender.findUniqueOrThrow({ where: { id: ids.comPlano } })
    expect(comPlano).toMatchObject({ resultadoFinal: true, situacao: 'HOMOLOGADA' })
    expect(Number(comPlano.valorHomologado)).toBe(2100)
  })

  it('respeita o teto de requisições e continua de onde parou na execução seguinte', async () => {
    const encerramento = new Date(AGORA.getTime() - 30 * DIA_MS)
    await prisma.tender.create({ data: licitacao('noTeto', encerramento) })
    await prisma.tenderItem.createMany({ data: [1, 2, 3, 4, 5].map((n) => itemNoBanco(ids.noTeto, n)) })
    await criarMatch(ids.noTeto, 'b')
    respostas.set(listaDeItens('noTeto'), [1, 2, 3, 4, 5].map((n) => itemDoPncp(n, 'Homologado', true)))
    for (const n of [1, 2, 3, 4, 5]) respostas.set(resultadosDoItem('noTeto', n), [resultado({ niFornecedor: `6666666600016${n}`, nomeRazaoSocialFornecedor: `FORNECEDOR ${n} LTDA`, valorTotalHomologado: 100 * n })])

    chamadas.length = 0
    const primeira = await conferir({ agora: new Date(AGORA.getTime() + 14 * HORA_MS), teto: 3, buscar })
    expect(primeira).toMatchObject({ parouNoTeto: true, requisicoes: 3, vencedores: 2 })
    expect(chamadas).toHaveLength(3)
    let noTeto = await prisma.tender.findUniqueOrThrow({ where: { id: ids.noTeto } })
    expect(noTeto).toMatchObject({ resultadoConferidoEm: null, resultadoFinal: false })
    expect([...(await itensGravados(ids.noTeto)).values()].filter((i) => i.vencedorNome !== null)).toHaveLength(2)

    chamadas.length = 0
    const segunda = await conferir({ agora: new Date(AGORA.getTime() + 14 * HORA_MS), teto: 10, buscar })
    expect(segunda).toMatchObject({ parouNoTeto: false, requisicoes: 4, vencedores: 3, finalizadas: 1 })
    expect(chamadas).toEqual([listaDeItens('noTeto'), resultadosDoItem('noTeto', 3), resultadosDoItem('noTeto', 4), resultadosDoItem('noTeto', 5)])
    noTeto = await prisma.tender.findUniqueOrThrow({ where: { id: ids.noTeto } })
    expect(noTeto).toMatchObject({ resultadoFinal: true, situacao: 'HOMOLOGADA' })
    expect(Number(noTeto.valorHomologado)).toBe(1500)
  })

  it('erro HTTP numa licitação não derruba a varredura', async () => {
    await prisma.tender.createMany({
      data: [licitacao('comErro', new Date(AGORA.getTime() - 40 * DIA_MS)), licitacao('depoisDoErro', new Date(AGORA.getTime() - 35 * DIA_MS))],
    })
    await prisma.tenderItem.createMany({ data: [itemNoBanco(ids.comErro, 1), itemNoBanco(ids.depoisDoErro, 1)] })
    await criarMatch(ids.comErro, 'a')
    await criarMatch(ids.depoisDoErro, 'a')
    respostas.set(listaDeItens('comErro'), Object.assign(new Error('Request failed with status code 500'), { isAxiosError: true, response: { status: 500 } }))
    respostas.set(listaDeItens('depoisDoErro'), [itemDoPncp(1, 'Fracassado', false)])

    const resumo = await conferir({ agora: new Date(AGORA.getTime() + 15 * HORA_MS), teto: 50, buscar })
    expect(resumo.falhas).toHaveLength(1)
    expect(resumo.falhas[0]).toContain(ids.comErro)
    const comErro = await prisma.tender.findUniqueOrThrow({ where: { id: ids.comErro } })
    expect(comErro.resultadoFinal).toBe(false)
    expect(comErro.resultadoConferidoEm).not.toBeNull()
    const depois = await prisma.tender.findUniqueOrThrow({ where: { id: ids.depoisDoErro } })
    expect(depois).toMatchObject({ resultadoFinal: true, situacao: 'ENCERRADA', valorHomologado: null })
  })

  it('licitação acompanhada sem itens no banco ganha os itens e o vencedor, só é reconferida depois de 48 h por ter encerrado há mais de 30 dias, e não duplica nem na coleta sob demanda', async () => {
    await prisma.tender.create({ data: licitacao('semItens', new Date(AGORA.getTime() - 50 * DIA_MS)) })
    await criarMatch(ids.semItens, 'a')
    respostas.set(listaDeItens('semItens'), [itemDoPncp(1, 'Homologado', true), itemDoPncp(2, 'Em andamento', false)])
    respostas.set(resultadosDoItem('semItens', 1), [resultado({ niFornecedor: '88888888000188', nomeRazaoSocialFornecedor: 'VENCEDORA SEM ITENS LTDA', valorTotalHomologado: 199, quantidadeHomologada: 100, valorUnitarioHomologado: 1.99 })])
    expect(await prisma.tenderItem.count({ where: { tenderId: ids.semItens } })).toBe(0)

    chamadas.length = 0
    const primeira = await conferir({ agora: new Date(AGORA.getTime() + 16 * HORA_MS), teto: 50, buscar })
    expect(primeira.itensCriados).toBe(2)
    expect(chamadasDa('semItens')).toEqual([listaDeItens('semItens'), resultadosDoItem('semItens', 1)])
    let itens = await itensGravados(ids.semItens)
    expect(itens.size).toBe(2)
    expect(itens.get(1)).toMatchObject({
      descricao: 'FEIJÃO CARIOCA ITEM 1',
      descricaoNorm: 'feijao carioca item 1',
      criterioJulgamento: 'Menor preço',
      catmatCode: '45001',
      catserCode: null,
      situacaoDoResultado: 'Homologado',
      vencedorNi: '88888888000188',
      vencedorNome: 'VENCEDORA SEM ITENS LTDA',
    })
    expect(Number(itens.get(1)?.quantidade)).toBe(100)
    expect(Number(itens.get(1)?.valorTotal)).toBe(250)
    expect(itens.get(2)).toMatchObject({ situacaoDoResultado: 'Em andamento', vencedorNome: null })
    expect((await prisma.tender.findUniqueOrThrow({ where: { id: ids.semItens } })).resultadoFinal).toBe(false)

    chamadas.length = 0
    await conferir({ agora: new Date(AGORA.getTime() + 29 * HORA_MS), teto: 50, buscar })
    expect(chamadasDa('semItens')).toEqual([])

    chamadas.length = 0
    const segunda = await conferir({ agora: new Date(AGORA.getTime() + 65 * HORA_MS), teto: 50, buscar })
    expect(chamadasDa('semItens')).toEqual([listaDeItens('semItens')])
    expect(segunda.itensCriados).toBe(0)

    const { saveTenderItemsIfMissing, garantirItensPNCP } = await import('../../src/services/tenderService')
    const { normalizarItemDoPncp } = await import('../../src/services/pncpItemsService')
    await saveTenderItemsIfMissing(ids.semItens, [itemDoPncp(1, 'Homologado', true), itemDoPncp(2, 'Em andamento', false)].map((i) => normalizarItemDoPncp(i)))
    expect(await garantirItensPNCP({ id: ids.semItens, fonte: 'PNCP', rawJson: { anoCompra: 2021, sequencialCompra: 18, orgaoEntidade: { cnpj } } })).toBe(false)

    itens = await itensGravados(ids.semItens)
    expect(await prisma.tenderItem.count({ where: { tenderId: ids.semItens } })).toBe(2)
    expect(itens.get(1)?.vencedorNome).toBe('VENCEDORA SEM ITENS LTDA')
  })

  it('o detalhe da licitação devolve o vencedor de cada item e o estado do resultado', async () => {
    const { status, corpo } = await obter(`/api/tenders/${ids.comMatch}`, tokens.a)
    expect(status).toBe(200)
    expect(corpo).toMatchObject({ id: ids.comMatch, resultadoFinal: true, situacao: 'HOMOLOGADA', resultadoConferidoEm: AGORA.toISOString() })
    expect(corpo).not.toHaveProperty('rawJson')
    const item1 = (corpo as { items: Record<string, unknown>[] }).items.find((i) => i.numeroItem === 1)
    expect(item1).toMatchObject({
      situacaoDoResultado: 'Homologado',
      vencedorNi: '52112156000168',
      vencedorNome: 'MERCEARIA SO MERENDAS LTDA',
      vencedorPorte: 'ME',
      fornecedoresRegistrados: 1,
      dataDoResultado: '2021-02-20T00:00:00.000Z',
    })
    expect(Number(item1?.valorUnitarioHomologado)).toBe(1.99)
    expect(Number(item1?.valorTotalHomologado)).toBe(1194)
  })

  it('Escolhidas traz a contagem de itens homologados, e a outra empresa não vê nada da primeira', async () => {
    const daA = await obter('/api/participation-plans', tokens.a)
    expect(daA.status).toBe(200)
    const porLicitacao = new Map((daA.corpo as { tenderId: string; tender: { itensHomologados: number; items?: unknown } }[]).map((p) => [p.tenderId, p.tender]))
    expect(porLicitacao.get(ids.comMatch)?.itensHomologados).toBe(3)
    expect(porLicitacao.get(ids.comPlano)?.itensHomologados).toBe(2)
    expect(porLicitacao.get(ids.comMatch)).not.toHaveProperty('items')
    expect(porLicitacao.get(ids.comMatch)).not.toHaveProperty('_count')

    const daB = await obter('/api/participation-plans', tokens.b)
    expect(daB.status).toBe(200)
    expect(daB.corpo).toEqual([])

    const planilhaDaB = await obter('/api/participation-plans/exportar', tokens.b)
    expect(planilhaDaB.status).toBe(200)
    const objetosDaB = [...textoDaColuna(lerPlanilha(planilhaDaB.bytes!), 'Objeto').values()]
    expect(objetosDaB.some((o) => o.includes('merenda'))).toBe(false)

    expect(await prisma.tenderParticipationPlan.count({ where: { companyId: usuarios.b.companyId } })).toBe(0)
    expect(await prisma.tenderMatch.count({ where: { companyId: usuarios.b.companyId, tenderId: { not: ids.noTeto } } })).toBe(0)
  })

  it('a exportação das Escolhidas passa a trazer o valor homologado', async () => {
    const { status, bytes } = await obter('/api/participation-plans/exportar', tokens.a)
    expect(status).toBe(200)
    const planilha = lerPlanilha(bytes!)
    const objetos = textoDaColuna(planilha, 'Objeto')
    const homologados = textoDaColuna(planilha, 'Valor homologado')
    const porObjeto = new Map([...objetos].map(([linha, objeto]) => [objeto, homologados.get(linha)]))
    expect(porObjeto.get('Aquisição de merenda comMatch')).toBe('2294')
    expect(porObjeto.get('Aquisição de merenda comPlano')).toBe('2100')
  })
})
