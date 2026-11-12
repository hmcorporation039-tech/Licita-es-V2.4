import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const CHAVE = 'c'.repeat(64)

rodar('Rota interna do comercial-ia: licitações abertas', () => {
  let server: Server
  let base = ''
  let prisma: typeof import('../../src/services/tenderService').prisma
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const termo = `luminarias publicas ${sufixo}`
  const dia = 86_400_000

  function buscar(query: string, chave: string | null = CHAVE) {
    return fetch(`${base}/api/interno/abertas?${query}`, { headers: chave ? { 'x-chave-comercial': chave } : {} })
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.COMERCIAL_IA_CHAVE = CHAVE
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const comum = { situacao: 'ABERTA' as const, rawJson: {}, contentHash: sufixo }
    const objeto = (resto: string) => ({ objeto: `[Portal de Compras Públicas] - Aquisição de ${termo} ${resto}`, objetoNorm: `aquisicao de ${termo} ${resto}` })
    await prisma.tender.createMany({
      data: [
        {
          ...comum,
          ...objeto('para o centro da cidade, com instalação, garantia de cinco anos e manutenção preventiva mensal durante toda a vigência do contrato, conforme termo de referência'),
          fonte: 'PNCP',
          fonteId: `comercial-${sufixo}-pregao`,
          modalidade: 'PREGAO_ELETRONICO',
          uf: 'GO',
          municipio: 'Anápolis',
          orgao: 'MUNICIPIO DE ANAPOLIS',
          valorEstimado: 850000.5,
          linkEdital: 'https://compras.exemplo.gov.br/edital/77',
          encerramentoAt: new Date(Date.now() + 6 * dia),
        },
        {
          ...comum,
          ...objeto('em LED'),
          fonte: 'PNCP',
          fonteId: `comercial-${sufixo}-dispensa`,
          modalidade: 'DISPENSA_COM_DISPUTA',
          uf: 'GO',
          municipio: 'Goiânia',
          orgao: 'Secretaria de Teste',
          encerramentoAt: new Date(Date.now() + 2 * dia),
        },
        {
          ...comum,
          ...objeto('outro estado'),
          fonte: 'PNCP',
          fonteId: `comercial-${sufixo}-sp`,
          modalidade: 'PREGAO_ELETRONICO',
          uf: 'SP',
          encerramentoAt: new Date(Date.now() + 3 * dia),
        },
        {
          ...comum,
          ...objeto('prazo vencido'),
          fonte: 'PNCP',
          fonteId: `comercial-${sufixo}-vencida`,
          modalidade: 'PREGAO_ELETRONICO',
          uf: 'GO',
          encerramentoAt: new Date(Date.now() - dia),
        },
        {
          ...comum,
          ...objeto('para atender o paciente por ordem judicial'),
          fonte: 'PNCP',
          fonteId: `comercial-${sufixo}-paciente`,
          modalidade: 'DISPENSA_SEM_DISPUTA',
          uf: 'GO',
          encerramentoAt: new Date(Date.now() + 1 * dia),
        },
      ],
    })
    const pregao = await prisma.tender.findUniqueOrThrow({ where: { fonteId: `comercial-${sufixo}-pregao` } })
    await prisma.tenderAnalysis.create({
      data: {
        tenderId: pregao.id,
        status: 'DONE',
        resultado: {
          resumo: 'Resumo',
          riscos: [
            { titulo: 'Amostra em 2 dias úteis', descricao: '...', severidade: 'media' },
            { titulo: 'Atestado de 50% do quantitativo', descricao: '...', severidade: 'alta' },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    await prisma.tender.deleteMany({ where: { fonteId: { startsWith: `comercial-${sufixo}` } } })
    server?.close()
    desconectar()
  })

  it('devolve as abertas do termo e da UF, pelo prazo mais próximo, com os campos combinados', async () => {
    const r = await buscar(`q=${encodeURIComponent(termo)}&uf=go`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const corpo = (await r.json()) as { total: number; itens: Array<Record<string, unknown>> }
    // A do paciente conta no total (mesma busca da vitrine), mas não vai para a mensagem.
    expect(corpo.total).toBe(3)
    expect(corpo.itens).toHaveLength(2)
    const [dispensa, pregao] = corpo.itens
    expect(Object.keys(pregao).sort()).toEqual(['id', 'link', 'modalidade', 'municipio', 'objeto', 'orgao', 'pontosAtencao', 'prazo', 'uf', 'valorEstimado'])
    expect(dispensa).toMatchObject({ modalidade: 'Dispensa com disputa', valorEstimado: null, pontosAtencao: [], uf: 'GO', municipio: 'Goiânia' })
    expect(String(dispensa.link)).toMatch(/\/tenders\//)
    expect(pregao).toMatchObject({
      modalidade: 'Pregão eletrônico',
      valorEstimado: 850000.5,
      orgao: 'MUNICÍPIO DE ANAPOLIS',
      link: 'https://compras.exemplo.gov.br/edital/77',
      pontosAtencao: ['Atestado de 50% do quantitativo', 'Amostra em 2 dias úteis'],
    })
    // Objeto completo, sem o prefixo do portal e sem cortar.
    expect(String(pregao.objeto)).toMatch(/^Aquisição de /)
    expect(String(pregao.objeto)).toMatch(/conforme termo de referência$/)
    expect(new Date(String(dispensa.prazo)).getTime()).toBeLessThan(new Date(String(pregao.prazo)).getTime())
    expect(new Date(String(dispensa.prazo)).getTime()).toBeGreaterThan(Date.now())
  })

  it('sem UF busca em todos os estados e respeita o limite', async () => {
    const corpo = (await (await buscar(`q=${encodeURIComponent(termo)}&limite=1`)).json()) as { total: number; itens: unknown[] }
    expect(corpo.total).toBe(4)
    expect(corpo.itens).toHaveLength(1)
  })

  it('recusa chave errada, ausente e parâmetros inválidos', async () => {
    expect((await buscar(`q=${encodeURIComponent(termo)}`, null)).status).toBe(401)
    expect((await buscar(`q=${encodeURIComponent(termo)}`, 'd'.repeat(64))).status).toBe(401)
    expect((await buscar('q=ab')).status).toBe(400)
    expect((await buscar(`q=${encodeURIComponent(termo)}&limite=51`)).status).toBe(400)
  })

  it('sem COMERCIAL_IA_CHAVE a rota não existe', async () => {
    const antes = process.env.COMERCIAL_IA_CHAVE
    process.env.COMERCIAL_IA_CHAVE = ''
    try {
      expect((await buscar(`q=${encodeURIComponent(termo)}`)).status).toBe(404)
    } finally {
      process.env.COMERCIAL_IA_CHAVE = antes
    }
  })
})
