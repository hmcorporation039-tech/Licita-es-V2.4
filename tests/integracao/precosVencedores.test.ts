import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const DIA_MS = 86_400_000

interface ItemDaResposta {
  itemId: string
  criterio: 'codigo' | 'descricao' | null
  amostras: number
  estatisticas: { amostras: number; minimo: number; mediana: number; maximo: number } | null
  unidade: string | null
  unidadeConfere: boolean | null
  descontoMedianoPct: number | null
  recentes: Record<string, unknown>[]
  quemMaisVence: { nome: string | null; porte: string | null; documento: string | null; vitorias: number }[]
}

interface Resposta {
  status: number
  body: { meses?: number; itens?: ItemDaResposta[]; error?: string } | null
  texto: string
}

function lerJson(texto: string): Resposta['body'] {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const PRODUTOS = [
  'cadeira giratoria executiva com bracos',
  'mesa de escritorio em mdf tampo 150 cm',
  'armario de aco com duas portas',
  'notebook processador i5 memoria 16 gb',
  'monitor led 24 polegadas full hd',
  'teclado usb abnt2 com fio',
  'mouse optico usb 1200 dpi',
  'impressora laser monocromatica duplex',
  'toner compativel para impressora laser',
  'cartucho de tinta preta original',
  'arroz agulhinha tipo 1 pacote 5 kg',
  'feijao carioca tipo 1 pacote 1 kg',
  'oleo de soja refinado garrafa 900 ml',
  'acucar cristal pacote 5 kg',
  'cafe torrado e moido pacote 500 g',
  'leite uht integral caixa 1 litro',
  'detergente liquido neutro frasco 500 ml',
  'agua sanitaria frasco 1 litro',
  'sabao em po caixa 1 kg',
  'papel higienico folha dupla fardo',
  'luva de procedimento em latex tamanho m',
  'mascara cirurgica descartavel tripla',
  'alcool etilico 70 por cento frasco 1 litro',
  'seringa descartavel 10 ml com agulha',
  'gaze hidrofila 7,5 x 7,5 cm pacote',
  'pneu aro 15 radial para veiculo leve',
  'oleo lubrificante para motor 15w40',
  'bateria automotiva 60 ah selada',
  'filtro de ar para caminhao',
  'lampada led tubular 18 w',
  'cabo eletrico flexivel 2,5 mm rolo 100 m',
  'disjuntor monopolar 20 a',
  'tinta acrilica fosca lata 18 litros',
  'cimento portland cp ii saco 50 kg',
  'tijolo ceramico de oito furos',
  'areia media lavada metro cubico',
  'brita numero 1 metro cubico',
  'tubo de pvc soldavel 25 mm barra 6 m',
  'registro de gaveta bronze 3/4',
  'caixa d agua de polietileno 1000 litros',
]

rodar('Histórico de preços vencedores', () => {
  let server: Server
  let base = ''
  let prisma: PrismaClient
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const semente = Number.parseInt(sufixo.slice(0, 5), 16) % 90_000
  const codigo = (n: number) => `9${String(semente + n).padStart(5, '0')}`
  const SENHA = 'Senha-forte-123'
  const futuro = new Date(Date.now() + 10 * DIA_MS)
  const diasAtras = (dias: number) => new Date(Date.now() - dias * DIA_MS)

  let tokenA = ''
  let tokenB = ''
  let alvoId = ''
  let duplicataId = ''
  let desempenhoId = ''
  const outrasLicitacoes: string[] = []
  const itensDoAlvo: Record<'codigo' | 'papel' | 'diferente' | 'grampeador' | 'outraUnidade', string> = { codigo: '', papel: '', diferente: '', grampeador: '', outraUnidade: '' }

  async function http(metodo: string, caminho: string, corpo?: unknown, token?: string): Promise<Resposta> {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await res.text()
    return { status: res.status, body: lerJson(texto), texto }
  }

  async function criarConta(nome: string) {
    const { hashPassword } = await import('../../src/services/authService')
    const u = await prisma.user.create({
      data: {
        email: `${nome}-${sufixo}@teste.local`,
        passwordHash: await hashPassword(SENHA),
        emailVerifiedAt: new Date(),
        company: { create: { name: `Empresa ${nome} ${sufixo}` } },
      },
    })
    const login = await http('POST', '/api/auth/login', { email: u.email, password: SENHA })
    return (login.body as { token: string }).token
  }

  async function novaLicitacao(rotulo: string, extra: Partial<Prisma.TenderUncheckedCreateInput> = {}) {
    const t = await prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `hist-${rotulo}-${sufixo}`,
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'HOMOLOGADA',
        objeto: `Compra ${rotulo} ${sufixo}`,
        orgao: `Órgão ${rotulo}`,
        municipio: 'Goiânia',
        uf: 'GO',
        rawJson: {},
        ...extra,
      },
    })
    return t.id
  }

  function itemVencido(tenderId: string, descricao: string, extra: Partial<Prisma.TenderItemCreateManyInput> = {}): Prisma.TenderItemCreateManyInput {
    return {
      tenderId,
      numeroItem: 1,
      descricao,
      descricaoNorm: semAcento(descricao),
      unidadeMedida: 'UN',
      quantidade: 10,
      valorUnitario: 10,
      situacaoDoResultado: 'Homologado',
      vencedorNi: '52112156000168',
      vencedorNome: 'Fornecedor Padrão LTDA',
      vencedorPorte: 'ME',
      valorUnitarioHomologado: 8,
      quantidadeHomologada: 10,
      dataDoResultado: diasAtras(30),
      ...extra,
    }
  }

  async function marcar(tenderId: string, token: string) {
    const r = await http('PATCH', `/api/tenders/${tenderId}/plano/status`, { status: 'VOU_PARTICIPAR' }, token)
    expect(r.status).toBe(200)
  }

  const doItem = (r: Resposta, itemId: string) => r.body!.itens!.find((i) => i.itemId === itemId)!

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

    tokenA = await criarConta('hista')
    tokenB = await criarConta('histb')

    alvoId = await novaLicitacao('alvo', { situacao: 'ABERTA', encerramentoAt: futuro, objeto: `Material de expediente ${sufixo}` })
    const alvo = [
      { chave: 'codigo', numeroItem: 1, descricao: 'CANETA ESFEROGRÁFICA AZUL CORPO SEXTAVADO', catmatCode: codigo(1), unidadeMedida: 'Unidade', valorUnitario: 2 },
      { chave: 'papel', numeroItem: 2, descricao: 'PAPEL SULFITE A4 75G RESMA COM 500 FOLHAS', unidadeMedida: 'Resma', valorUnitario: 30 },
      { chave: 'diferente', numeroItem: 3, descricao: 'SERVIÇO DE DEDETIZAÇÃO E DESRATIZAÇÃO PREDIAL', unidadeMedida: 'Serviço', valorUnitario: 900 },
      { chave: 'grampeador', numeroItem: 4, descricao: 'GRAMPEADOR METÁLICO DE MESA 26/6 CAPACIDADE 20 FOLHAS', catmatCode: codigo(2), unidadeMedida: 'UN', valorUnitario: 40 },
      { chave: 'outraUnidade', numeroItem: 5, descricao: 'CLIPE NIQUELADO 2/0', catmatCode: codigo(3), unidadeMedida: 'Unidade', valorUnitario: 0.1 },
    ] as const
    for (const it of alvo) {
      const { chave, ...dados } = it
      const criado = await prisma.tenderItem.create({ data: { tenderId: alvoId, descricaoNorm: semAcento(dados.descricao), quantidade: 100, ...dados } })
      itensDoAlvo[chave] = criado.id
    }
    await prisma.tenderItem.create({
      data: itemVencido(alvoId, 'CANETA ESFEROGRÁFICA AZUL DA PRÓPRIA LICITAÇÃO', { numeroItem: 9, catmatCode: codigo(1), valorUnitarioHomologado: 999 }) as Prisma.TenderItemUncheckedCreateInput,
    })
    duplicataId = await novaLicitacao('duplicata', { duplicataDe: alvoId })
    await prisma.tenderItem.create({
      data: itemVencido(duplicataId, 'CANETA ESFEROGRÁFICA AZUL NA CÓPIA', { catmatCode: codigo(1), valorUnitarioHomologado: 888 }) as Prisma.TenderItemUncheckedCreateInput,
    })

    const vencedores = [
      { vencedorNi: '11222333000181', vencedorNome: 'Alfa Papelaria LTDA', vencedorPorte: 'EPP' },
      { vencedorNi: '11222333000181', vencedorNome: 'Alfa Papelaria LTDA', vencedorPorte: 'EPP' },
      { vencedorNi: '11222333000181', vencedorNome: 'Alfa Papelaria LTDA', vencedorPorte: 'EPP' },
      { vencedorNi: '12345678901', vencedorNome: 'José da Silva', vencedorPorte: null },
      { vencedorNi: '52112156000168', vencedorNome: 'Beta Comércio LTDA', vencedorPorte: 'ME' },
    ]
    const itensDasOutras: Prisma.TenderItemCreateManyInput[] = []
    for (let i = 0; i < 5; i++) {
      const id = await novaLicitacao(`outra${i}`, { municipio: i % 2 ? 'Anápolis' : 'Goiânia', linkEdital: `https://pncp.gov.br/app/editais/outra-${i}-${sufixo}` })
      outrasLicitacoes.push(id)
      itensDasOutras.push(itemVencido(id, `Caneta esferográfica azul ${i}`, { catmatCode: codigo(1), unidadeMedida: 'UN', valorUnitario: 2, valorUnitarioHomologado: 1 + i * 0.25, dataDoResultado: diasAtras(10 + i * 20), ...vencedores[i] }))
      itensDasOutras.push(itemVencido(id, ['Papel sulfite A4 75g resma 500 folhas branco', 'PAPEL SULFITE A4 75 G RESMA COM 500 FOLHAS', 'Papel sulfite branco A4 75g, resma com 500 folhas', 'papel sulfite a4 75g resma 500 folhas alcalino', 'Papel sulfite A4 75g resma de 500 folhas'][i], { numeroItem: 2, unidadeMedida: 'Resma', valorUnitario: 30, valorUnitarioHomologado: 20 + i, dataDoResultado: diasAtras(15 + i) }))
      if (i < 3) itensDasOutras.push(itemVencido(id, 'Grampeador metálico de mesa 26/6 capacidade para 20 folhas', { numeroItem: 3, valorUnitario: 40, valorUnitarioHomologado: 30 + i }))
      itensDasOutras.push(itemVencido(id, 'Clipe niquelado 2/0 caixa com 100', { numeroItem: 4, catmatCode: codigo(3), unidadeMedida: 'Caixa', valorUnitario: 8, valorUnitarioHomologado: 6 + i }))
      itensDasOutras.push(itemVencido(id, 'Pneu aro 15 radial para veículo leve', { numeroItem: 5, valorUnitario: 400, valorUnitarioHomologado: 350 }))
    }
    itensDasOutras.push(itemVencido(outrasLicitacoes[0], 'Grampeador de mesa genérico', { numeroItem: 6, catmatCode: codigo(2), valorUnitarioHomologado: 35 }))
    itensDasOutras.push(itemVencido(outrasLicitacoes[1], 'Caneta esferográfica azul antiga', { numeroItem: 7, catmatCode: codigo(1), valorUnitarioHomologado: 5000, dataDoResultado: diasAtras(30 * 30) }))
    itensDasOutras.push(itemVencido(outrasLicitacoes[2], 'Caneta esferográfica azul sem vencedor', { numeroItem: 8, catmatCode: codigo(1), valorUnitarioHomologado: 7000, vencedorNi: null }))
    await prisma.tenderItem.createMany({ data: itensDasOutras })

    await marcar(alvoId, tokenA)
  }, 120_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('exige login', async () => {
    expect((await http('GET', `/api/estudos/${alvoId}/precos-vencedores`)).status).toBe(401)
  })

  it('a empresa sem acesso à licitação não consegue', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenB)
    expect(r.status).toBe(409)
    expect(r.body?.itens).toBeUndefined()
    expect((await http('GET', `/api/estudos/${randomUUID()}/precos-vencedores`, undefined, tokenA)).status).toBe(404)
  })

  it('casa por código, com quem mais vence e o CPF mascarado', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    expect(r.status).toBe(200)
    expect(r.body?.meses).toBe(24)
    const caneta = doItem(r, itensDoAlvo.codigo)
    expect(caneta).toMatchObject({ criterio: 'codigo', amostras: 5, unidade: 'UN', unidadeConfere: true })
    expect(caneta.estatisticas).toMatchObject({ amostras: 5, minimo: 1, mediana: 1.5, maximo: 2 })
    expect(caneta.descontoMedianoPct).toBe(25)
    expect(caneta.recentes).toHaveLength(5)
    expect(caneta.recentes[0]).toMatchObject({ orgao: 'Órgão outra0', municipio: 'Goiânia', uf: 'GO', precoVencedor: 1, precoEstimado: 2, unidade: 'UN', quantidade: 10, vencedorNome: 'Alfa Papelaria LTDA', vencedorPorte: 'EPP' })
    expect(caneta.quemMaisVence[0]).toEqual({ nome: 'Alfa Papelaria LTDA', porte: 'EPP', documento: '11.222.333/0001-81', vitorias: 3 })
    expect(caneta.quemMaisVence.map((f) => f.documento)).toContain('***.456.789-**')
    expect(r.texto).not.toContain('12345678901')
  })

  it('exclui a própria licitação, a cópia dela em outra fonte, casos antigos e itens sem vencedor', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    const precos = doItem(r, itensDoAlvo.codigo).recentes.map((c) => c.precoVencedor)
    for (const fora of [999, 888, 5000, 7000]) expect(precos).not.toContain(fora)
    expect(doItem(r, itensDoAlvo.codigo).estatisticas?.maximo).toBe(2)
  })

  it('não devolve id nem link da outra licitação', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    for (const id of [...outrasLicitacoes, duplicataId]) expect(r.texto).not.toContain(id)
    expect(r.texto).not.toContain('pncp.gov.br/app/editais')
    expect(r.texto).not.toMatch(/tenderId|linkEdital|fonteId|numeroControle/)
  })

  it('casa por descrição parecida e não casa descrição diferente', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    const papel = doItem(r, itensDoAlvo.papel)
    expect(papel.criterio).toBe('descricao')
    expect(papel.amostras).toBeGreaterThanOrEqual(4)
    expect(papel.unidadeConfere).toBe(true)
    expect(papel.estatisticas?.mediana).toBeGreaterThanOrEqual(20)
    expect(papel.estatisticas?.maximo).toBeLessThanOrEqual(24)
    expect(papel.recentes.every((c) => /papel sulfite/i.test(String(c.descricao)))).toBe(true)

    const diferente = doItem(r, itensDoAlvo.diferente)
    expect(diferente).toMatchObject({ criterio: null, amostras: 0, estatisticas: null, recentes: [], quemMaisVence: [] })
  })

  it('código com menos de 3 casos cai para a descrição', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    const grampeador = doItem(r, itensDoAlvo.grampeador)
    expect(grampeador.criterio).toBe('descricao')
    expect(grampeador.amostras).toBeGreaterThanOrEqual(3)
    expect(grampeador.recentes.every((c) => /grampeador metalico|grampeador metálico/i.test(String(c.descricao)))).toBe(true)
  })

  it('avisa quando a unidade dos casos difere da unidade do item', async () => {
    const r = await http('GET', `/api/estudos/${alvoId}/precos-vencedores`, undefined, tokenA)
    const clipe = doItem(r, itensDoAlvo.outraUnidade)
    expect(clipe).toMatchObject({ criterio: 'codigo', amostras: 5, unidade: 'CX', unidadeConfere: false })
  })

  it('responde rápido com ~2.000 itens com vencedor e uma licitação de 80 itens', async () => {
    const licitacoes = Array.from({ length: 100 }, (_, i) => ({
      id: randomUUID(),
      fonte: 'PNCP' as const,
      fonteId: `hist-carga-${i}-${sufixo}`,
      modalidade: 'PREGAO_ELETRONICO' as const,
      situacao: 'HOMOLOGADA' as const,
      objeto: `Carga ${i} ${sufixo}`,
      orgao: `Prefeitura carga ${i}`,
      municipio: 'Goiânia',
      uf: 'GO',
      rawJson: {},
    }))
    await prisma.tender.createMany({ data: licitacoes })
    const variacoes = ['', ' marca de referencia', ' primeira linha', ' conforme termo de referencia', ' entrega parcelada']
    const carga: Prisma.TenderItemCreateManyInput[] = []
    for (let i = 0; i < 2000; i++) {
      const produto = i % PRODUTOS.length
      const comCodigo = Math.floor(i / PRODUTOS.length) % 2 === 0
      const descricao = `${PRODUTOS[produto]}${variacoes[Math.floor(i / PRODUTOS.length) % variacoes.length]}`
      carga.push(
        itemVencido(licitacoes[i % licitacoes.length].id, descricao, {
          numeroItem: i + 1,
          catmatCode: comCodigo ? codigo(100 + produto) : null,
          valorUnitario: 100 + produto,
          valorUnitarioHomologado: 80 + produto + (i % 7),
          vencedorNi: String(10_000_000_000_000 + (i % 37)).padStart(14, '0'),
          vencedorNome: `Fornecedor ${i % 37}`,
          dataDoResultado: diasAtras(1 + (i % 600)),
        })
      )
    }
    await prisma.tenderItem.createMany({ data: carga })

    desempenhoId = await novaLicitacao('desempenho', { situacao: 'ABERTA', encerramentoAt: futuro })
    await prisma.tenderItem.createMany({
      data: Array.from({ length: 80 }, (_, i) => {
        const produto = i % PRODUTOS.length
        const descricao = `${PRODUTOS[produto].toUpperCase()} ITEM ${i + 1}`
        return {
          tenderId: desempenhoId,
          numeroItem: i + 1,
          descricao,
          descricaoNorm: semAcento(descricao),
          catmatCode: i < 40 ? codigo(100 + produto) : null,
          unidadeMedida: 'UN',
          quantidade: 5,
          valorUnitario: 100 + produto,
        }
      }),
    })
    await marcar(desempenhoId, tokenA)
    await prisma.$executeRawUnsafe('ANALYZE tender_items')
    await prisma.$executeRawUnsafe('ANALYZE tenders')

    await http('GET', `/api/estudos/${desempenhoId}/precos-vencedores`, undefined, tokenA)
    const tempos: number[] = []
    let ultima: Resposta | null = null
    for (let i = 0; i < 3; i++) {
      const inicio = performance.now()
      ultima = await http('GET', `/api/estudos/${desempenhoId}/precos-vencedores`, undefined, tokenA)
      tempos.push(performance.now() - inicio)
    }
    console.log(`[precos-vencedores] 80 itens, ~2.000 casos: ${tempos.map((t) => Math.round(t)).join(' / ')} ms`)
    expect(ultima!.status).toBe(200)
    const itens = ultima!.body!.itens!
    expect(itens).toHaveLength(80)
    expect(itens.slice(0, 40).every((i) => i.criterio === 'codigo' && i.amostras >= 3)).toBe(true)
    expect(itens.slice(40).every((i) => i.criterio === 'descricao' && i.amostras >= 3)).toBe(true)
    expect(Math.min(...tempos)).toBeLessThan(1500)
  }, 120_000)
})
