import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/emailService', async (original) => ({
  ...(await original<typeof import('../../src/services/emailService')>()),
  sendMatchEmail: vi.fn(async () => undefined),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

type Corpo = Record<string, unknown> & {
  id: string
  token: string
  total: number
  items: Array<Record<string, unknown>>
  matchesEncontrados?: number
  matchesRemovidos?: number
  matchesFound?: number
  totais?: { comPrazoConfirmado: number; semDataInformada: number }
}

const BRASILIA = { lat: -15.7801, lng: -47.9292 }
const ANAPOLIS = { lat: -16.3281, lng: -48.953 }

rodar('Rodada de QA: busca por palavra inteira e matches coerentes', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let normalize: (texto: string) => string
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const letras = sufixo.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])
  const termo = (nome: string) => `zq${nome}${letras}ta`
  const dias = (n: number) => new Date(Date.now() + n * 86_400_000)
  const ids: Record<string, string> = {}

  const http = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Corpo }
  }

  const novoItem = async (corpo: Record<string, unknown>) => {
    const existentes = (await http('GET', '/api/monitored-items')).body as unknown as Array<{ id: string }>
    for (const item of existentes) await http('DELETE', `/api/monitored-items/${item.id}`)
    const criado = await http('POST', '/api/monitored-items', corpo)
    expect(criado.status).toBe(201)
    return criado
  }

  const licitacao = async (nome: string, objeto: string, extra: Record<string, unknown> = {}) => {
    const orgao = (extra.orgao as string | undefined) ?? 'Órgão de Teste'
    const criada = await prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `qa-${sufixo}-${nome}`,
        modalidade: 'PREGAO_ELETRONICO',
        situacao: 'ABERTA',
        objeto,
        objetoNorm: normalize(objeto),
        objetoResumidoNorm: normalize(objeto),
        orgao,
        orgaoNorm: normalize(orgao),
        uf: 'GO',
        encerramentoAt: dias(5),
        publicadoAt: dias(-1),
        rawJson: {},
        ...extra,
      },
    })
    ids[nome] = criada.id
    return criada.id as string
  }

  const matchesDoItem = async (itemId: string): Promise<string[]> => {
    const matches = await prisma.tenderMatch.findMany({ where: { monitoredItemId: itemId }, include: { tender: { select: { fonteId: true } } } })
    return matches.map((m: { tender: { fonteId: string } }) => m.tender.fonteId.replace(`qa-${sufixo}-`, '')).sort()
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste'
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    const { app } = await import('../../src/api/server')
    ;({ prisma } = await import('../../src/services/tenderService'))
    ;({ normalize } = await import('../../src/lib/geoService'))
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    server = app.listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const { hashPassword } = await import('../../src/services/authService')
    await prisma.user.create({
      data: { email: `qa-busca-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `QA ${sufixo}` } } },
    })
    token = (await http('POST', '/api/auth/login', { email: `qa-busca-${sufixo}@teste.local`, password: 'Senha-forte-123' })).body.token
  }, 120_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { startsWith: `qa-${sufixo}-` } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('A1/M12: criar o item já busca, licitação encerrada nunca vira match e o notificador não manda e-mail por match', async () => {
    const t = termo('aum')
    await licitacao('a1-aberta', `Aquisição de ${t} para a secretaria`)
    await licitacao('a1-encerrada', `Aquisição de ${t} para o almoxarifado`, { encerramentoAt: dias(-2) })

    const criado = await novoItem({ name: 'A1', keywords: [t] })
    expect(criado.status).toBe(201)
    expect(criado.body.matchesEncontrados).toBe(1)
    expect(await matchesDoItem(criado.body.id)).toEqual(['a1-aberta'])

    const rematch = await http('POST', `/api/monitored-items/${criado.body.id}/rematch`)
    expect(rematch.body.matchesFound).toBe(0)
    expect(await matchesDoItem(criado.body.id)).toEqual(['a1-aberta'])

    const item = await prisma.monitoredItem.findUnique({ where: { id: criado.body.id } })
    const antigo = await prisma.tenderMatch.create({
      data: { tenderId: ids['a1-encerrada'], monitoredItemId: item.id, companyId: item.companyId, userId: item.userId, score: 0.9, matchedKeywords: [t] },
    })
    const aberto = await prisma.tenderMatch.findFirst({ where: { monitoredItemId: item.id, tenderId: ids['a1-aberta'] } })
    const { processarMatch } = await import('../../src/workers/notificador')
    const { sendMatchEmail } = await import('../../src/services/emailService')
    vi.mocked(sendMatchEmail).mockClear()
    await processarMatch({ tenderMatchId: antigo.id })
    expect(sendMatchEmail).not.toHaveBeenCalled()
    await processarMatch({ tenderMatchId: aberto.id })
    expect(sendMatchEmail).not.toHaveBeenCalled()
  }, 60_000)

  it('A2: editar o item tira os matches que deixaram de valer, mas mantém a licitação escolhida', async () => {
    const t = termo('dois')
    await licitacao('a2-escritorio', `Cadeiras ${t} para escritório`, { uf: 'GO' })
    await licitacao('a2-gamer', `Cadeiras ${t} gamer`, { uf: 'DF' })
    await licitacao('a2-escolhida', `Cadeiras ${t} gamer premium`, { uf: 'DF', encerramentoAt: dias(10) })

    const criado = await novoItem({ name: 'A2', keywords: [t] })
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida', 'a2-escritorio', 'a2-gamer'])
    expect((await http('PATCH', `/api/tenders/${ids['a2-escolhida']}/plano/status`, { status: 'VOU_PARTICIPAR' })).status).toBe(200)

    const semGamer = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { palavrasDeExclusao: ['gamer'] })
    expect(semGamer.status).toBe(200)
    expect((semGamer.body as { busca?: string }).busca).toBe('concluida')
    expect(semGamer.body.matchesRemovidos).toBe(1)
    expect((await http('GET', `/api/monitored-items/${criado.body.id}/busca`)).body).toMatchObject({ estado: 'concluida', encontrados: 0, removidos: 1 })
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida', 'a2-escritorio'])

    await http('PATCH', `/api/monitored-items/${criado.body.id}`, { ufs: ['DF'] })
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida'])

    const outraPalavra = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { keywords: [termo('outra')] })
    expect(outraPalavra.body.matchesRemovidos).toBe(0)
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida'])

    const deVolta = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { keywords: [t], ufs: [], palavrasDeExclusao: [] })
    expect(deVolta.body.matchesEncontrados).toBe(2)
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida', 'a2-escritorio', 'a2-gamer'])

    const soNome = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { name: 'A2 renomeado' })
    expect(soNome.body.matchesRemovidos).toBeUndefined()

    const mesmoRecorte = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { name: 'A2', keywords: [t], ufs: [], palavrasDeExclusao: [], catmatCodes: [], valorMin: null, raioKm: null, origemMunicipio: null })
    expect(mesmoRecorte.status).toBe(200)
    expect((mesmoRecorte.body as { busca?: string }).busca).toBeUndefined()
    expect(mesmoRecorte.body.matchesRemovidos).toBeUndefined()

    const desativado = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { active: false })
    expect((desativado.body as { busca?: string; active?: boolean }).busca).toBeUndefined()
    expect((desativado.body as { active?: boolean }).active).toBe(false)
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida', 'a2-escritorio', 'a2-gamer'])

    await prisma.tenderMatch.deleteMany({ where: { monitoredItemId: criado.body.id, tenderId: ids['a2-gamer'] } })
    const ativado = await http('PATCH', `/api/monitored-items/${criado.body.id}`, { active: true })
    expect((ativado.body as { busca?: string }).busca).toBe('concluida')
    expect(ativado.body.matchesEncontrados).toBe(1)
    expect(ativado.body.matchesRemovidos).toBeUndefined()
    expect(await matchesDoItem(criado.body.id)).toEqual(['a2-escolhida', 'a2-escritorio', 'a2-gamer'])
    const situacao = await http('GET', `/api/monitored-items/${criado.body.id}/busca`)
    expect(situacao.body).toMatchObject({ estado: 'concluida', encontrados: 1, removidos: null })
  }, 60_000)

  it('A4/A5: lista e vitrine contam palavra inteira com plural, não pedaço de outra palavra', async () => {
    const t = termo('aco')
    await licitacao('a5-singular', `Aquisição de ${t} inox`)
    await licitacao('a5-plural', `Fornecimento de ${t}s laminados`)
    await licitacao('a5-pedaco', `Contratação de pre${t}do`)
    await licitacao('a5-frase', `Aquisição de materiais de ${t}`)

    const lista = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&pageSize=100`)
    expect(lista.body.total).toBe(3)
    const plural = await http('GET', `/api/tenders?q=${encodeURIComponent(`${t}s`)}&pageSize=100`)
    expect(plural.body.total).toBe(3)
    const frase = await http('GET', `/api/tenders?q=${encodeURIComponent(`material de ${t}`)}`)
    expect(frase.body.total).toBe(1)
    const pagina2 = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&pageSize=2&page=2`)
    expect(pagina2.body.items).toHaveLength(1)
    expect(pagina2.body.totalPages).toBe(2)

    const vitrine = await http('GET', `/api/public/vitrine?q=${encodeURIComponent(t)}`)
    expect(vitrine.body.total).toBe(3)
    expect((vitrine.body as unknown as { amostras: unknown[] }).amostras).toHaveLength(3)
    const vitrineFrase = await http('GET', `/api/public/vitrine?q=${encodeURIComponent(`material de ${t}`)}&uf=GO`)
    expect(vitrineFrase.body.total).toBe(1)
  }, 60_000)

  it('A4/A5: o regex do Postgres concorda com o regex do item nos casos de borda', async () => {
    const t = termo('borda')
    const objetos = [`${t}`, `(${t})`, `${t}-03`, `${t}_x`, `x_${t}`, `pre${t}`, `${t}s.`, `"${t}"`, `nº${t}`, `${t}/${t}`, `item 1:${t};`, `${t}2`, `2${t}`, `– ${t} –`]
    for (const [i, objeto] of objetos.entries()) await licitacao(`borda-${i}`, `Objeto ${objeto} fim`)
    const { idsQueCitamOTextoNoBanco } = await import('../../src/services/buscaDeLicitacoes')
    const { buildKeywordRegex } = await import('../../src/lib/matching')
    const regex = buildKeywordRegex(t)!
    const esperadas = objetos.map((objeto, i) => [i, regex.test(normalize(`Objeto ${objeto} fim`))] as const).filter(([, casa]) => casa).map(([i]) => ids[`borda-${i}`]).sort()
    expect(esperadas.length).toBeGreaterThan(5)
    expect((await idsQueCitamOTextoNoBanco(t)).sort()).toEqual(esperadas)
  }, 60_000)

  it('M2: o raio vale mais que a UF pré-preenchida da empresa', async () => {
    const t = termo('raio')
    await licitacao('m2-anapolis', `Manutenção de ${t}`, { uf: 'GO', municipio: 'Anápolis', municipioLat: ANAPOLIS.lat, municipioLng: ANAPOLIS.lng })
    const criado = await novoItem({ name: 'M2', keywords: [t], ufs: ['DF'], raioKm: 300, origemMunicipio: 'Brasília', origemUf: 'DF' })
    expect(criado.status).toBe(201)
    expect(await matchesDoItem(criado.body.id)).toEqual(['m2-anapolis'])
    void BRASILIA
  }, 60_000)

  it('M3: "Prefeitura de Uberlândia" acha o MUNICIPIO DE UBERLANDIA do PNCP na lista e no item', async () => {
    const t = termo('orgao')
    await licitacao('m3-uberlandia', `Aquisição de ${t}`, { orgao: 'MUNICIPIO DE UBERLANDIA' })
    await licitacao('m3-araguari', `Aquisição de ${t}`, { orgao: 'MUNICIPIO DE ARAGUARI' })
    const lista = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&orgao=${encodeURIComponent('Prefeitura de Uberlândia')}`)
    expect(lista.body.total).toBe(1)
    const criado = await novoItem({ name: 'M3', keywords: [t], orgaos: ['Prefeitura Municipal de Uberlândia'] })
    expect(await matchesDoItem(criado.body.id)).toEqual(['m3-uberlandia'])
  }, 60_000)

  it('M4: o número da compra (112/2026) e o processo também são buscados', async () => {
    const t = termo('numero')
    await licitacao('m4-compra', `Aquisição de ${t}`, { numeroControle: '00000000000191-1-000999/2026', rawJson: { numeroCompra: '112', anoCompra: 2026, processo: '23000.000777/2026-11' } })
    await licitacao('m4-outra', `Aquisição de ${t}`, { numeroControle: '00000000000191-1-000998/2026', rawJson: { numeroCompra: '113', anoCompra: 2026 } })
    const porNumero = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&numero=${encodeURIComponent('112/2026')}`)
    expect(porNumero.body.total).toBe(1)
    const comZeros = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&numero=${encodeURIComponent('0112/2026')}`)
    expect(comZeros.body.total).toBe(1)
    const porProcesso = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&numero=${encodeURIComponent('000777/2026')}`)
    expect(porProcesso.body.total).toBe(1)
    const porControle = await http('GET', `/api/tenders?q=${encodeURIComponent(t)}&numero=${encodeURIComponent('000998/2026')}`)
    expect(porControle.body.total).toBe(1)
  }, 60_000)

  it('M1/M13: o painel conta o mesmo que o feed e a lista separa o que tem prazo confirmado', async () => {
    const t = termo('painel')
    await licitacao('m1-normal', `Aquisição de ${t}`)
    await licitacao('m1-sem-publicacao', `Dispensa de ${t}`, { encerramentoAt: null, publicadoAt: null, modalidade: 'DISPENSA_SEM_DISPUTA' })
    await licitacao('m1-distante', `Concorrência de ${t}`, { encerramentoAt: dias(60) })
    await licitacao('m1-sem-data', `Dispensa recente de ${t}`, { encerramentoAt: null, publicadoAt: dias(-2), modalidade: 'DISPENSA_SEM_DISPUTA' })
    const criado = await novoItem({ name: 'M1', keywords: [t] })
    expect(criado.body.matchesEncontrados).toBe(4)

    const painel = (await http('GET', '/api/dashboard')).body as unknown as { matchesNaoLidos: number; matchesTotal: number }
    const naoLidos = await http('GET', '/api/matches?unreadOnly=true&pageSize=1')
    const todos = await http('GET', '/api/matches?pageSize=1')
    expect(painel.matchesNaoLidos).toBe(naoLidos.body.total)
    expect(painel.matchesTotal).toBe(todos.body.total)
    const doItem = await prisma.tenderMatch.count({ where: { monitoredItemId: criado.body.id } })
    expect(doItem).toBe(4)

    const lista = await http('GET', '/api/tenders?pageSize=1')
    expect(lista.body.totais).toBeDefined()
    expect(lista.body.totais!.comPrazoConfirmado + lista.body.totais!.semDataInformada).toBe(lista.body.total)
    expect(lista.body.totais!.semDataInformada).toBeGreaterThanOrEqual(1)
  }, 60_000)

  it('M14: nas relacionadas, a obra completa vai para o fim mesmo com prazo mais cedo', async () => {
    const t = termo('obra')
    await licitacao('m14-obra', `Execução da obra de construção da escola, com movimento de terra; drenagem; fundações; estruturas; alvenarias; cobertura; ${t}; instalações hidrossanitárias`, { encerramentoAt: dias(1) })
    await licitacao('m14-direta', `Aquisição de ${t}`, { encerramentoAt: dias(6) })
    await novoItem({ name: 'M14', keywords: [t] })

    const comBusca = await http('GET', `/api/tenders?somenteRelacionadas=true&q=${encodeURIComponent(t)}`)
    expect(comBusca.body.items.map((i) => i.id)).toEqual([ids['m14-direta'], ids['m14-obra']])

    const semBusca = await http('GET', '/api/tenders?somenteRelacionadas=true&pageSize=100')
    const ordem = semBusca.body.items.map((i) => (i.match as { dentroDeObraCompleta: boolean }).dentroDeObraCompleta)
    expect(ordem.indexOf(true)).toBeGreaterThan(-1)
    expect(ordem.slice(ordem.indexOf(true)).every(Boolean)).toBe(true)
    const posicoes = semBusca.body.items.map((i) => i.id)
    expect(posicoes.indexOf(ids['m14-direta'])).toBeLessThan(posicoes.indexOf(ids['m14-obra']))
  }, 60_000)

  it('M15: o painel mostra o limite de impugnação das licitações escolhidas', async () => {
    const painel = (await http('GET', '/api/dashboard')).body as unknown as { proximosPrazos: Array<{ tenderId: string; label: string; date: string }> }
    const limite = painel.proximosPrazos.find((p) => p.tenderId === ids['a2-escolhida'] && p.label === 'Limite para impugnar ou pedir esclarecimento')
    expect(limite).toBeDefined()
    expect(new Date(limite!.date).getTime()).toBeLessThan(dias(10).getTime())
    expect(new Date(limite!.date).getTime()).toBeGreaterThan(Date.now() - 86_400_000)
  }, 60_000)

  it('mapa de oportunidades: conta por estado o mesmo que o feed e lista as do estado clicado', async () => {
    const t = termo('mapa')
    await licitacao('mapa-go-1', `Aquisição de ${t}`)
    await licitacao('mapa-go-2', `Registro de preços de ${t}`)
    await licitacao('mapa-ba', `Contratação de ${t}`, { uf: 'BA' })
    await licitacao('mapa-encerrada', `Pregão de ${t}`, { uf: 'MG', encerramentoAt: dias(-1) })
    await novoItem({ name: 'Mapa', keywords: [t] })

    const mapa = await http('GET', '/api/dashboard/mapa/oportunidades')
    expect(mapa.status).toBe(200)
    const estados = mapa.body.estados as unknown as Array<{ uf: string; total: number }>
    expect(estados).toEqual([{ uf: 'GO', total: 2 }, { uf: 'BA', total: 1 }])

    const goias = await http('GET', '/api/dashboard/mapa/oportunidades/go')
    expect(goias.body.total).toBe(2)
    expect((goias.body.tenders as unknown as Array<{ id: string }>).map((x) => x.id).sort()).toEqual([ids['mapa-go-1'], ids['mapa-go-2']].sort())

    const minas = await http('GET', '/api/dashboard/mapa/oportunidades/MG')
    expect(minas.body.total).toBe(0)
    expect((await http('GET', '/api/dashboard/mapa/oportunidades/xyz')).status).toBe(400)
  }, 60_000)
})
