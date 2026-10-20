import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/emailService', async (original) => ({
  ...(await original<typeof import('../../src/services/emailService')>()),
  sendMatchEmail: vi.fn(async () => undefined),
  sendResumoDiarioEmail: vi.fn(async () => true),
}))

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Rodada 2 de QA: datas impossíveis, repetição entre fontes, contagem de fontes e resumo diário', () => {
  let server: Server
  let base = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let normalize: (texto: string) => string
  let desconectar: () => void = () => undefined
  let token = ''
  const sufixo = randomUUID().slice(0, 8)
  const letras = sufixo.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])
  const palavra = (nome: string) => `zq${nome}${letras}ta`
  const dias = (n: number) => new Date(Date.now() + n * 86_400_000)
  const prefixo = `qa2-${sufixo}-`

  const registro = async (nome: string, dados: Record<string, unknown>) => {
    const objeto = dados.objeto as string
    const municipio = dados.municipio as string | undefined
    return prisma.tender.create({
      data: {
        fonteId: `${prefixo}${nome}`,
        situacao: 'ABERTA',
        objetoNorm: normalize(objeto),
        municipioNorm: municipio ? normalize(municipio) : null,
        rawJson: {},
        ...dados,
      },
    })
  }

  const local = async (nome: string, uf: string) => {
    const { findMunicipioByNomeUf } = await import('../../src/lib/geoService')
    const m = findMunicipioByNomeUf(nome, uf)
    if (!m) throw new Error(`município de teste não encontrado: ${nome}/${uf}`)
    return { uf, municipio: nome, municipioIbge: m.codigoIbge }
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
      data: { email: `qa2-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `QA2 ${sufixo}` } } },
    })
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `qa2-${sufixo}@teste.local`, password: 'Senha-forte-123' }),
    })
    token = ((await login.json()) as { token: string }).token
  }, 120_000)

  afterAll(async () => {
    vi.useRealTimers()
    await prisma?.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  it('N1: a gravação descarta a data impossível e a limpeza não vira aviso de alteração', async () => {
    const { saveTender } = await import('../../src/services/tenderService')
    const sest = {
      fonte: 'SEST_SENAT' as const,
      fonteId: `${prefixo}sest-2087`,
      modalidade: 'PREGAO_ELETRONICO' as const,
      objeto: `Aquisição de ${palavra('sest')}`,
      encerramentoAt: new Date('2087-01-05T03:00:00Z'),
      aberturaAt: new Date('2026-10-30T13:00:00Z'),
      numeroControle: '003/2017',
      rawJson: {},
    }
    await saveTender(sest)
    const gravada = await prisma.tender.findUnique({ where: { fonteId: sest.fonteId } })
    expect(gravada.encerramentoAt).toBeNull()
    expect(gravada.aberturaAt?.toISOString()).toBe('2026-10-30T13:00:00.000Z')

    await registro('sest-antiga', { fonte: 'SEST_SENAT', modalidade: 'PREGAO_ELETRONICO', objeto: sest.objeto, encerramentoAt: new Date('2201-02-08T03:00:00Z'), numeroControle: '0102017' })
    const recoleta = await saveTender({ ...sest, fonteId: `${prefixo}sest-antiga`, encerramentoAt: new Date('2201-02-08T03:00:00Z'), numeroControle: '0102017', aberturaAt: undefined })
    expect(recoleta.changedFields).not.toContain('encerramentoAt')
    expect((await prisma.tender.findUnique({ where: { fonteId: `${prefixo}sest-antiga` } })).encerramentoAt).toBeNull()
  })

  it('N5a: o aviso do diário gravado antes da licitação do PNCP some quando ela chega pela coleta', async () => {
    const gameleira = await local('Gameleira', 'PE')
    const objeto = `Aquisição de ${palavra('gam')} para a secretaria municipal de saúde`
    const diario = await registro('qd-gameleira', { fonte: 'QUERIDO_DIARIO', modalidade: 'PREGAO_ELETRONICO', objeto, ...gameleira, aberturaAt: dias(8), publicadoAt: dias(-1) })
    const antes = (await fetch(`${base}/api/tenders?q=${palavra('gam')}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())) as { total: number }
    expect(antes.total).toBe(1)

    const { gravarContratacoesPncp } = await import('../../src/workers/coletorPNCP')
    const { contadoresZerados } = await import('../../src/services/pncpColeta')
    const contadores = contadoresZerados()
    await gravarContratacoesPncp(
      [
        {
          numeroControlePNCP: `${prefixo}pncp-gameleira`,
          modalidadeId: 6,
          objetoCompra: objeto,
          orgaoEntidade: { cnpj: '10000000000191', razaoSocial: 'MUNICIPIO DE GAMELEIRA', esferaId: 'M' },
          unidadeOrgao: { ufSigla: 'PE', municipioNome: 'Gameleira', codigoIbge: gameleira.municipioIbge },
          anoCompra: 2026,
          sequencialCompra: 31,
          numeroCompra: '31/2026',
          dataPublicacaoPncp: new Date().toISOString(),
          dataEncerramentoProposta: dias(8).toISOString(),
        },
      ],
      contadores,
      'teste'
    )
    expect(contadores).toMatchObject({ novos: 1, comErro: 0 })
    const pncp = await prisma.tender.findUnique({ where: { fonteId: `${prefixo}pncp-gameleira` } })
    expect((await prisma.tender.findUnique({ where: { id: diario.id } })).duplicataDe).toBe(pncp.id)

    const lista = (await fetch(`${base}/api/tenders?q=${palavra('gam')}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())) as { items: { id: string }[] }
    expect(lista.items.map((t) => t.id)).toEqual([pncp.id])
  }, 60_000)

  it('N5b: credenciamento do diário é a mesma licitação que a inexigibilidade do PNCP', async () => {
    const pitanga = await local('Pitanga', 'PR')
    const objeto = `Credenciamento de ${palavra('pit')} para atendimento da rede municipal`
    const diario = await registro('dm-pitanga', { fonte: 'DIARIO_MUNICIPAL', modalidade: 'CREDENCIAMENTO', objeto, ...pitanga, aberturaAt: dias(20), publicadoAt: dias(-3) })
    const pncp = await registro('pncp-pitanga', { fonte: 'PNCP', modalidade: 'INEXIGIBILIDADE', objeto, ...pitanga, encerramentoAt: dias(20), publicadoAt: dias(-1) })

    const { existeNoPncp } = await import('../../src/services/queridoDiarioService')
    expect(await existeNoPncp({ fonte: 'DIARIO_MUNICIPAL', fonteId: diario.fonteId, modalidade: 'CREDENCIAMENTO', objeto, ...pitanga, aberturaAt: dias(20), rawJson: {} })).toBe(true)

    const { esconderRepeticoesDaLicitacaoDoPncp, licitacaoDoPncpDoRegistro } = await import('../../src/services/duplicataEntreFontes')
    const doBanco = await prisma.tender.findUnique({ where: { id: diario.id } })
    expect(await licitacaoDoPncpDoRegistro(doBanco)).toBe(pncp.id)

    const tenderDoPncp = { fonte: 'PNCP' as const, fonteId: pncp.fonteId, modalidade: 'INEXIGIBILIDADE' as const, objeto, ...pitanga, encerramentoAt: pncp.encerramentoAt, rawJson: {} }
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncp.id, tenderDoPncp)).toBe(1)
    expect((await prisma.tender.findUnique({ where: { id: diario.id } })).duplicataDe).toBe(pncp.id)
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncp.id, tenderDoPncp)).toBe(0)
  })

  it('N5: o TCE-CE que repete o PNCP também some, e o que não repete continua', async () => {
    const caninde = await local('Canindé', 'CE')
    const objeto = `Aquisição de ${palavra('cnd')} para as escolas da rede municipal`
    const repetida = await registro('tce-canind-repetida', { fonte: 'TCE_CE', modalidade: 'PREGAO_ELETRONICO', objeto, ...caninde, aberturaAt: dias(9), publicadoAt: dias(-2), numeroControle: '00.017/2026-PE' })
    const unica = await registro('tce-canind-unica', {
      fonte: 'TCE_CE', modalidade: 'CONCORRENCIA', objeto: `Construção de ${palavra('cnu')} no distrito sede`, ...caninde, aberturaAt: dias(9), publicadoAt: dias(-2), numeroControle: '00.018/2026-CC',
    })
    const pncp = await registro('pncp-canind', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto, ...caninde, encerramentoAt: dias(9), publicadoAt: dias(-1) })

    const { esconderRepeticoesDaLicitacaoDoPncp } = await import('../../src/services/duplicataEntreFontes')
    const tenderDoPncp = { fonte: 'PNCP' as const, fonteId: pncp.fonteId, modalidade: 'PREGAO_ELETRONICO' as const, objeto, ...caninde, encerramentoAt: pncp.encerramentoAt, rawJson: {} }
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncp.id, tenderDoPncp)).toBe(1)
    expect((await prisma.tender.findUnique({ where: { id: repetida.id } })).duplicataDe).toBe(pncp.id)
    expect((await prisma.tender.findUnique({ where: { id: unica.id } })).duplicataDe).toBeNull()
  })

  it('N15: busca só com "de" é recusada com mensagem amigável', async () => {
    const r = await fetch(`${base}/api/tenders?q=de`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(400)
    const corpo = (await r.json()) as { error: string; code: string }
    expect(corpo.code).toBe('BUSCA_SEM_PALAVRA')
    expect(corpo.error).toMatch(/pelo menos uma palavra/)
    expect((await fetch(`${base}/api/tenders?q=${encodeURIComponent('de ' + palavra('gam'))}`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)
  })

  it('N12: a página de entrada conta fontes pela marca e lista as marcas com licitação aberta', async () => {
    await registro('senai-aberta', { fonte: 'SISTEMA_S', modalidade: 'PREGAO_ELETRONICO', objeto: `Aquisição de ${palavra('sen')}`, orgao: 'SENAI-PE', uf: 'PE', aberturaAt: dias(6), publicadoAt: dias(-1) })
    const { MARCAS_DAS_FONTES } = await import('../../src/lib/marcasDasFontes')
    const e = (await (await fetch(`${base}/api/public/estatisticas`)).json()) as { fontes: number; marcas: string[] }
    expect(e.marcas).toContain('SENAI')
    expect(e.marcas).toContain('PNCP')
    expect(e.fontes).toBe(e.marcas.length)
    expect(e.marcas.every((m) => (MARCAS_DAS_FONTES as readonly string[]).includes(m))).toBe(true)
  })

  it('N16: o resumo diário conta o dia de Brasília, não o dia UTC', async () => {
    const agoraReal = new Date()
    const noiteEmBrasilia = new Date(Date.UTC(agoraReal.getUTCFullYear(), agoraReal.getUTCMonth(), agoraReal.getUTCDate() + 1, 2, 0))
    const diaEmBrasilia = new Date(Date.UTC(agoraReal.getUTCFullYear(), agoraReal.getUTCMonth(), agoraReal.getUTCDate())).toISOString().slice(0, 10)
    const madrugadaSeguinte = new Date(noiteEmBrasilia.getTime() + 2 * 3_600_000)
    const diaSeguinte = new Date(Date.UTC(agoraReal.getUTCFullYear(), agoraReal.getUTCMonth(), agoraReal.getUTCDate() + 1)).toISOString().slice(0, 10)

    const empresa = await prisma.company.create({ data: { name: `QA2 teto ${sufixo}` } })
    const usuario = await prisma.user.create({ data: { email: `qa2-teto-${sufixo}@teste.local`, passwordHash: 'x', companyId: empresa.id } })
    const item = await prisma.monitoredItem.create({ data: { companyId: empresa.id, userId: usuario.id, name: 'Teto', keywords: [palavra('teto')], catmatCodes: [], catserCodes: [], ufs: [] } })
    const tender = await registro('teto', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto: `Aquisição de ${palavra('teto')}`, encerramentoAt: dias(10), publicadoAt: dias(-1) })
    const outra = await registro('teto-2', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto: `Fornecimento de ${palavra('teto')}`, encerramentoAt: dias(12), publicadoAt: dias(-1) })
    await prisma.tenderMatch.create({ data: { tenderId: tender.id, monitoredItemId: item.id, companyId: empresa.id, userId: usuario.id, score: 0.9, matchedKeywords: [palavra('teto')], createdAt: new Date(noiteEmBrasilia.getTime() - 3_600_000) } })

    const { enviarResumoDoUsuario, idDoResumoDiario } = await import('../../src/services/resumoDiario')
    const { sendResumoDiarioEmail } = await import('../../src/services/emailService')
    try {
      vi.mocked(sendResumoDiarioEmail).mockClear()
      expect(await enviarResumoDoUsuario(usuario.id, noiteEmBrasilia)).toBe('enviado')
      expect(await prisma.notification.count({ where: { id: idDoResumoDiario(usuario.id, diaEmBrasilia) } })).toBe(1)

      await prisma.tenderMatch.create({ data: { tenderId: outra.id, monitoredItemId: item.id, companyId: empresa.id, userId: usuario.id, score: 0.9, matchedKeywords: [palavra('teto')], createdAt: new Date(noiteEmBrasilia.getTime() + 3_600_000) } })
      expect(await enviarResumoDoUsuario(usuario.id, madrugadaSeguinte)).toBe('enviado')
      expect(await prisma.notification.count({ where: { id: idDoResumoDiario(usuario.id, diaSeguinte) } })).toBe(1)
      expect(sendResumoDiarioEmail).toHaveBeenCalledTimes(2)
    } finally {
      await prisma.notification.deleteMany({ where: { userId: usuario.id } })
      await prisma.tenderMatch.deleteMany({ where: { companyId: empresa.id } })
      await prisma.monitoredItem.deleteMany({ where: { companyId: empresa.id } })
    }
  }, 60_000)
})
