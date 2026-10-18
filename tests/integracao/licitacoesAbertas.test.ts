// Integração (PostgreSQL real; só roda com TEST_DATABASE_URL): o filtro do banco
// (whereLicitacaoAberta) e a regra em memória (estaAberta) concordam, e as buscas
// só devolvem licitações abertas.
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Somente licitações abertas', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const agora = new Date()
  const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000)
  const anoAtual = new Date(agora.getTime() - 3 * 3_600_000).getUTCFullYear()
  let token = ''

  const casos: Record<string, Record<string, unknown>> = {
    prazoFuturo: { encerramentoAt: dias(5), publicadoAt: dias(-400), aberturaAt: dias(-10), uf: 'GO' },
    prazoVencido: { encerramentoAt: dias(-1) },
    homologada: { encerramentoAt: dias(5), valorHomologado: 1000 },
    revogada: { encerramentoAt: dias(5), situacao: 'REVOGADA' },
    dispensaRecente: { publicadoAt: dias(-3), aberturaAt: dias(-3), uf: 'DF', modalidade: 'DISPENSA_SEM_DISPUTA' },
    dispensaDeAnoPassado: { publicadoAt: dias(-500), aberturaAt: dias(-500) },
    sessaoFiegFutura: { fonte: 'FIEG', aberturaAt: dias(2), publicadoAt: dias(-60), uf: 'SP', modalidade: 'DISPENSA_COM_DISPUTA' },
    sessaoFiegPassada: { fonte: 'FIEG', aberturaAt: dias(-2), publicadoAt: dias(-3) },
    sestSenatDe2016SemData: { fonte: 'SEST_SENAT', numeroControle: '089/2016' },
    sestSenatDesteAnoSemData: { fonte: 'SEST_SENAT', numeroControle: `DL008868-0/${anoAtual}`, uf: 'SP' },
    sestSenatSemAnoSemData: { fonte: 'SEST_SENAT', numeroControle: 'VES6201200101' },
    sescGoDe2017SemData: { fonte: 'SESC_GO', numeroControle: '17/01.00120-DL' },
    sescRegionalPublicadaHaPouco: { fonte: 'SESC_REGIONAL', publicadoAt: dias(-3), uf: 'SP' },
    sescRegionalDeAnoPassadoPublicadaHaPouco: { fonte: 'SESC_REGIONAL', publicadoAt: dias(-3), numeroControle: `001/${anoAtual - 1}` },
    novacapComPrazoENumeroAntigo: { fonte: 'NOVACAP', encerramentoAt: dias(10), numeroControle: `00006/${anoAtual - 1}`, uf: 'SP' },
    sestSenatDe2017ComPrazoEm2087: { fonte: 'SEST_SENAT', encerramentoAt: new Date('2087-01-05T03:00:00Z'), numeroControle: '003/2017' },
    sestSenatDe2019ComPrazoNoAno5219: { fonte: 'SEST_SENAT', encerramentoAt: new Date('5219-10-15T03:00:00Z'), numeroControle: '010/2019' },
    sistemaSDoAnoPassadoComSessaoEm2206: { fonte: 'SISTEMA_S', aberturaAt: new Date('2206-08-28T03:00:00Z'), numeroControle: `466/${anoAtual - 1}` },
    tceCeComReaberturaEm2202: { fonte: 'TCE_CE', aberturaAt: new Date('2202-11-21T11:00:00Z'), publicadoAt: new Date('2022-11-30T03:00:00Z') },
    pncpAntigoComPrazoEm2102: { encerramentoAt: new Date('2102-03-01T03:00:00Z'), publicadoAt: dias(-400) },
    pncpCredenciamentoDeDezAnos: { encerramentoAt: dias(3650), publicadoAt: dias(-10), modalidade: 'CREDENCIAMENTO', uf: 'SP' },
    pregaoDeFevereiroComPrazoEm2029: { encerramentoAt: dias(870), publicadoAt: dias(-250), aberturaAt: dias(-250) },
    presencialRecenteComPrazoTresAnosDepois: { encerramentoAt: dias(1070), publicadoAt: dias(-3), aberturaAt: dias(-38), modalidade: 'PREGAO_PRESENCIAL', uf: 'SP' },
    concorrenciaAntigaComPrazoTresAnosDepois: { encerramentoAt: dias(1070), publicadoAt: dias(-60), modalidade: 'CONCORRENCIA' },
    inexigibilidadeComPrazoDeTresAnos: { encerramentoAt: dias(1070), publicadoAt: dias(-60), modalidade: 'INEXIGIBILIDADE', uf: 'SP' },
    diarioRepetidoDoPncp: { fonte: 'QUERIDO_DIARIO', aberturaAt: dias(5), publicadoAt: dias(-2), duplicataDe: 'id-da-licitacao-do-pncp' },
  }
  const abertas = [
    'prazoFuturo', 'dispensaRecente', 'sessaoFiegFutura', 'sestSenatDesteAnoSemData', 'sescRegionalPublicadaHaPouco', 'novacapComPrazoENumeroAntigo', 'pncpCredenciamentoDeDezAnos',
    'presencialRecenteComPrazoTresAnosDepois', 'inexigibilidadeComPrazoDeTresAnos',
  ]
  const comPrazoConfirmado = ['prazoFuturo', 'sessaoFiegFutura', 'novacapComPrazoENumeroAntigo', 'pncpCredenciamentoDeDezAnos', 'inexigibilidadeComPrazoDeTresAnos']

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

    for (const [nome, extra] of Object.entries(casos)) {
      await prisma.tender.create({
        data: {
          fonte: 'PNCP', fonteId: `${nome}-${sufixo}`, modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA',
          objeto: `objeto ${nome} ${sufixo}`, objetoNorm: `objeto ${nome.toLowerCase()} ${sufixo}`, rawJson: {}, ...extra,
        },
      })
    }
    const { preencherAnoDoProcesso } = await import('../../src/services/anoDoProcessoBackfill')
    await preencherAnoDoProcesso()
    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `abertas-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `E ${sufixo}` } } },
    })
    token = ((await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `abertas-${sufixo}@teste.local`, password: 'Senha-forte-123' }) })).json()) as { token: string }).token
  }, 60_000)

  afterAll(async () => {
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('o filtro do banco e a regra em memória concordam em todos os casos', async () => {
    const { whereLicitacaoAberta, estaAberta } = await import('../../src/lib/licitacaoAberta')
    const anos = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo }, anoDoProcesso: { not: null } }, select: { fonteId: true, anoDoProcesso: true } })
    expect(Object.fromEntries(anos.map((t: { fonteId: string; anoDoProcesso: number }) => [t.fonteId.replace(`-${sufixo}`, ''), t.anoDoProcesso]))).toEqual({
      sestSenatDe2016SemData: 2016,
      sestSenatDesteAnoSemData: anoAtual,
      sescGoDe2017SemData: 2017,
      sescRegionalDeAnoPassadoPublicadaHaPouco: anoAtual - 1,
      novacapComPrazoENumeroAntigo: anoAtual - 1,
      sestSenatDe2017ComPrazoEm2087: 2017,
      sestSenatDe2019ComPrazoNoAno5219: 2019,
      sistemaSDoAnoPassadoComSessaoEm2206: anoAtual - 1,
    })
    const todas = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo } } })
    const noBanco = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo }, ...whereLicitacaoAberta() }, select: { fonteId: true } })
    const nomes = (l: { fonteId: string }[]) => l.map((t) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(nomes(noBanco)).toEqual([...abertas].sort())
    expect(nomes(todas.filter((t: Parameters<typeof estaAberta>[0]) => estaAberta(t)))).toEqual([...abertas].sort())
  })

  it('o prazo confirmado (página de entrada e contagem da lista) ignora data impossível e repetição do PNCP', async () => {
    const { whereLicitacaoComPrazoConfirmado } = await import('../../src/lib/licitacaoAberta')
    const noBanco = await prisma.tender.findMany({ where: { fonteId: { endsWith: sufixo }, ...whereLicitacaoComPrazoConfirmado() }, select: { fonteId: true } })
    expect(noBanco.map((t: { fonteId: string }) => t.fonteId.replace(`-${sufixo}`, '')).sort()).toEqual([...comPrazoConfirmado].sort())
  })

  it('GET /api/tenders devolve só as abertas', async () => {
    const r = (await (await fetch(`${base}/api/tenders?q=${sufixo}&pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { items: { fonteId: string }[] }
    const nomes = r.items.map((t: { fonteId: string }) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(nomes).toEqual([...abertas].sort())
  })

  it('GET /api/tenders filtra por um ou vários estados e recusa sigla que não existe', async () => {
    const buscar = async (uf: string) => fetch(`${base}/api/tenders?q=${sufixo}&pageSize=50&uf=${encodeURIComponent(uf)}`, { headers: { Authorization: `Bearer ${token}` } })
    const nomes = async (uf: string) => ((await (await buscar(uf)).json()) as { items: { fonteId: string }[] }).items.map((t) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(await nomes('go')).toEqual(['prazoFuturo'])
    expect(await nomes('GO,DF')).toEqual(['dispensaRecente', 'prazoFuturo'])
    expect(await nomes('GO, DF, SP')).toEqual([...abertas].sort())
    expect((await buscar('GO,XX')).status).toBe(400)
  })

  it('GET /api/tenders filtra por uma ou várias modalidades e recusa modalidade que não existe', async () => {
    const buscar = async (modalidade: string) => fetch(`${base}/api/tenders?q=${sufixo}&pageSize=50&modalidade=${encodeURIComponent(modalidade)}`, { headers: { Authorization: `Bearer ${token}` } })
    const nomes = async (modalidade: string) => ((await (await buscar(modalidade)).json()) as { items: { fonteId: string }[] }).items.map((t) => t.fonteId.replace(`-${sufixo}`, '')).sort()
    expect(await nomes('DISPENSA_SEM_DISPUTA')).toEqual(['dispensaRecente'])
    expect(await nomes('DISPENSA_COM_DISPUTA,DISPENSA_SEM_DISPUTA')).toEqual(['dispensaRecente', 'sessaoFiegFutura'])
    expect((await buscar('DISPENSA_COM_DISPUTA,LEILAO_FALSO')).status).toBe(400)
  })
})
