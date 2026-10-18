import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Rodada 3 de QA: repetição entre fontes só com sinal firme, prazo improvável, aviso sem objeto e filtro de município', () => {
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
  const prefixo = `qa3-${sufixo}-`
  const emDias = (n: number, hora = 9) => {
    const d = new Date(Date.now() + n * 86_400_000)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hora + 3))
  }

  const registro = async (nome: string, dados: Record<string, unknown>) => {
    const objeto = dados.objeto as string
    const municipio = dados.municipio as string | undefined
    return prisma.tender.create({
      data: {
        fonteId: dados.fonteId ?? `${prefixo}${nome}`,
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

  const duplicataDe = async (id: string) => (await prisma.tender.findUnique({ where: { id } })).duplicataDe

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
      data: { email: `qa3-${sufixo}@teste.local`, passwordHash: await hashPassword('Senha-forte-123'), emailVerifiedAt: new Date(), company: { create: { name: `QA3 ${sufixo}` } } },
    })
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `qa3-${sufixo}@teste.local`, password: 'Senha-forte-123' }),
    })
    token = ((await login.json()) as { token: string }).token
  }, 120_000)

  afterAll(async () => {
    await prisma?.tender.deleteMany({ where: { fonteId: { contains: sufixo } } })
    server?.close()
    desconectar()
    await prisma?.$disconnect()
  })

  const listar = async (consulta: string) =>
    ((await fetch(`${base}/api/tenders?${consulta}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())) as { items: { id: string; municipio: string }[] }).items

  it('N18: Paranhos, Salvador e Campinas não somem; a repetição de verdade some; a revisão diária devolve as escondidas por engano', async () => {
    const paranhos = await local('Paranhos', 'MS')
    const salvador = await local('Salvador', 'BA')
    const campinas = await local('Campinas', 'SP')
    const mossoro = await local('Mossoró', 'RN')

    const qdParanhos = await registro('qd-paranhos', {
      fonte: 'QUERIDO_DIARIO', fonteId: `QD-${paranhos.municipioIbge}:PREGAO:49-2026:${sufixo}`, modalidade: 'PREGAO_PRESENCIAL', ...paranhos,
      objeto: `Registro de preços para futura e eventual aquisição de ferramentas e equipamentos para a secretaria de obras ${palavra('par')}`,
      orgao: 'Prefeitura Municipal de Paranhos', aberturaAt: emDias(8), publicadoAt: emDias(-2),
    })
    const pncpParanhos = await registro('pncp-paranhos', {
      fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', ...paranhos,
      objeto: `Registro de preço para futura e eventual aquisição de ferros e equipamentos para a secretaria de obras ${palavra('par')}`,
      orgao: 'MUNICIPIO DE PARANHOS', aberturaAt: emDias(-2), encerramentoAt: emDias(11), publicadoAt: emDias(-2), rawJson: { numeroCompra: '07', anoCompra: 2026 },
    })

    const qdSalvador = await registro('qd-salvador', {
      fonte: 'QUERIDO_DIARIO', fonteId: `QD-${salvador.municipioIbge}:PREGAO:12-2026:${sufixo}`, modalidade: 'PREGAO_ELETRONICO', ...salvador,
      objeto: `Apresentação musical da Banda no Baile das Atrizes e no bloco do Carnaval ${palavra('sal')}`, orgao: 'Prefeitura Municipal de Salvador', aberturaAt: emDias(10), publicadoAt: emDias(-1),
    })
    const pncpSalvador = await registro('pncp-salvador', {
      fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', ...salvador, objeto: `Serviço auxiliar de carga e descarga para atendimento do Carnaval ${palavra('sal')}`,
      orgao: 'ESTADO DA BAHIA', aberturaAt: emDias(-1), encerramentoAt: emDias(10), publicadoAt: emDias(-1), rawJson: { numeroCompra: 'SGTO/01/26', anoCompra: 2026 },
    })

    const qdCampinas = await registro('qd-campinas', {
      fonte: 'QUERIDO_DIARIO', fonteId: `QD-${campinas.municipioIbge}:DISPENSA:19-2026:${sufixo}`, modalidade: 'DISPENSA_SEM_DISPUTA', ...campinas,
      objeto: `Contratação de empresa para prestação de serviços de seguro para veículos ${palavra('cam')}`, orgao: 'Prefeitura Municipal de Campinas', publicadoAt: emDias(-1),
    })
    const pncpCampinas = await registro('pncp-campinas', {
      fonte: 'PNCP', modalidade: 'DISPENSA_SEM_DISPUTA', ...campinas, objeto: `Disponibilização temporária de espaço físico para o Fórum Estudantil ${palavra('cam')}`,
      orgao: 'FUNDACAO MUNICIPAL PARA EDUCACAO COMUNITARIA-FUMEC-', publicadoAt: emDias(-1), rawJson: { numeroCompra: '19', anoCompra: 2026 },
    })

    const objetoMossoro = `Aquisição de materiais médico hospitalares de uso geral ${palavra('mos')}`
    const qdMossoro = await registro('qd-mossoro', {
      fonte: 'QUERIDO_DIARIO', fonteId: `QD-${mossoro.municipioIbge}:PREGAO:20-2026:${sufixo}`, modalidade: 'PREGAO_ELETRONICO', ...mossoro,
      objeto: objetoMossoro, orgao: 'Prefeitura Municipal de Mossoró', aberturaAt: emDias(9), publicadoAt: emDias(-2),
    })
    const pncpMossoro = await registro('pncp-mossoro', {
      fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', ...mossoro, objeto: `O objeto da presente licitação é a aquisição de materiais médico hospitalares de uso geral ${palavra('mos')}`,
      orgao: 'MUNICIPIO DE MOSSORO', aberturaAt: emDias(-1), encerramentoAt: emDias(9, 8), publicadoAt: emDias(-1), rawJson: { numeroCompra: '20', anoCompra: 2026 },
    })

    const tceAntiga = await registro('tce-republicada', { fonte: 'TCE_CE', modalidade: 'PREGAO_ELETRONICO', objeto: `Aquisição de ${palavra('tce')}`, uf: 'CE', aberturaAt: emDias(5), publicadoAt: emDias(-3) })
    const tceRecente = await registro('tce-recente', { fonte: 'TCE_CE', modalidade: 'PREGAO_ELETRONICO', objeto: `Aquisição de ${palavra('tce')}`, uf: 'CE', aberturaAt: emDias(5), publicadoAt: emDias(-1) })
    await prisma.tender.update({ where: { id: tceAntiga.id }, data: { duplicataDe: tceRecente.id } })

    const { esconderRepeticoesDaLicitacaoDoPncp, revisarRepeticoesDoPncp } = await import('../../src/services/duplicataEntreFontes')
    const { existeNoPncp } = await import('../../src/services/queridoDiarioService')
    const comoNormalizada = (t: Record<string, unknown>) => ({ ...t, aberturaAt: t.aberturaAt ?? undefined, encerramentoAt: t.encerramentoAt ?? undefined, publicadoAt: t.publicadoAt ?? undefined, orgao: t.orgao ?? undefined }) as never
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncpParanhos.id, comoNormalizada(pncpParanhos))).toBe(0)
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncpSalvador.id, comoNormalizada(pncpSalvador))).toBe(0)
    expect(await esconderRepeticoesDaLicitacaoDoPncp(pncpCampinas.id, comoNormalizada(pncpCampinas))).toBe(0)
    expect(await existeNoPncp(comoNormalizada({ ...qdParanhos, rawJson: {} }))).toBe(false)
    expect(await existeNoPncp(comoNormalizada({ ...qdMossoro, rawJson: {} }))).toBe(true)

    await prisma.tender.update({ where: { id: qdParanhos.id }, data: { duplicataDe: pncpParanhos.id } })
    await prisma.tender.update({ where: { id: qdSalvador.id }, data: { duplicataDe: pncpSalvador.id } })
    await prisma.tender.update({ where: { id: qdCampinas.id }, data: { duplicataDe: pncpCampinas.id } })

    const revisao = await revisarRepeticoesDoPncp()
    expect(revisao.restaurados.QUERIDO_DIARIO ?? 0).toBeGreaterThanOrEqual(3)
    expect(await duplicataDe(qdParanhos.id)).toBeNull()
    expect(await duplicataDe(qdSalvador.id)).toBeNull()
    expect(await duplicataDe(qdCampinas.id)).toBeNull()
    expect(await duplicataDe(qdMossoro.id)).toBe(pncpMossoro.id)
    expect(await duplicataDe(tceAntiga.id)).toBe(tceRecente.id)

    const deNovo = await revisarRepeticoesDoPncp()
    expect(await duplicataDe(qdMossoro.id)).toBe(pncpMossoro.id)
    expect(await duplicataDe(qdParanhos.id)).toBeNull()
    expect(deNovo.escondidos.QUERIDO_DIARIO ?? 0).toBe(0)

    const visiveis = (await listar(`q=${palavra('par')}`)).map((t) => t.id).sort()
    expect(visiveis).toEqual([qdParanhos.id, pncpParanhos.id].sort())
    expect((await listar(`q=${palavra('mos')}`)).map((t) => t.id)).toEqual([pncpMossoro.id])

    const detalhe = (await fetch(`${base}/api/tenders/${qdMossoro.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())) as { duplicataDe: string | null }
    expect(detalhe.duplicataDe).toBe(pncpMossoro.id)
  }, 120_000)

  it('N14: aviso de diário sem objeto some das buscas sem ser apagado e volta quando ganha objeto', async () => {
    const curitiba = await local('Curitiba', 'PR')
    const vazio = await registro('qd-sem-objeto', { fonte: 'QUERIDO_DIARIO', modalidade: 'PREGAO_ELETRONICO', objeto: 'LICITAÇÃO COMPARTILHADA', ...curitiba, aberturaAt: emDias(6), publicadoAt: emDias(-1) })
    const { revisarAvisosSemObjeto, MOTIVO_SEM_OBJETO } = await import('../../src/services/duplicataEntreFontes')
    const { whereLicitacaoAberta } = await import('../../src/lib/licitacaoAberta')
    const aberta = async () => (await prisma.tender.count({ where: { id: vazio.id, ...whereLicitacaoAberta() } })) === 1
    expect(await aberta()).toBe(true)

    expect((await revisarAvisosSemObjeto()).semObjeto).toBeGreaterThanOrEqual(1)
    expect((await prisma.tender.findUnique({ where: { id: vazio.id } })).motivoOculta).toBe(MOTIVO_SEM_OBJETO)
    expect(await aberta()).toBe(false)

    const objeto = `Aquisição de ${palavra('cur')} para as escolas`
    await prisma.tender.update({ where: { id: vazio.id }, data: { objeto, objetoNorm: normalize(objeto) } })
    expect((await revisarAvisosSemObjeto()).comObjetoDeVolta).toBeGreaterThanOrEqual(1)
    expect(await aberta()).toBe(true)
  }, 60_000)

  it('N17: pregão com prazo em 2029 sai das abertas no banco e na memória; credenciamento longo continua', async () => {
    const { whereLicitacaoAberta, whereLicitacaoComPrazoConfirmado, estaAberta } = await import('../../src/lib/licitacaoAberta')
    const pregao = await registro('pregao-2029', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto: `Aquisição de ${palavra('p29')}`, publicadoAt: new Date('2026-02-12T15:00:00Z'), aberturaAt: new Date('2026-02-12T15:00:00Z'), encerramentoAt: new Date('2029-03-05T12:00:00Z') })
    const saae = await registro('saae-2029', { fonte: 'PNCP', modalidade: 'DISPENSA_COM_DISPUTA', objeto: `Aquisição de ${palavra('saa')}`, publicadoAt: emDias(-2), aberturaAt: emDias(-38), encerramentoAt: new Date('2029-09-24T11:00:00Z') })
    const credenciamento = await registro('cred-longo', { fonte: 'PNCP', modalidade: 'CREDENCIAMENTO', objeto: `Credenciamento de ${palavra('cre')}`, publicadoAt: emDias(-10), encerramentoAt: emDias(3000) })
    const ids = [pregao.id, saae.id, credenciamento.id]
    const linhas = await prisma.tender.findMany({ where: { id: { in: ids } } })
    expect(Object.fromEntries(linhas.map((t: { id: string; prazoImprovavel: boolean }) => [t.id, t.prazoImprovavel]))).toEqual({ [pregao.id]: true, [saae.id]: true, [credenciamento.id]: false })
    const noBanco = (await prisma.tender.findMany({ where: { id: { in: ids }, ...whereLicitacaoAberta() }, select: { id: true } })).map((t: { id: string }) => t.id).sort()
    expect(noBanco).toEqual([saae.id, credenciamento.id].sort())
    expect(linhas.filter((t: Parameters<typeof estaAberta>[0]) => estaAberta(t)).map((t: { id: string }) => t.id).sort()).toEqual(noBanco)
    const comPrazo = (await prisma.tender.findMany({ where: { id: { in: ids }, ...whereLicitacaoComPrazoConfirmado() }, select: { id: true } })).map((t: { id: string }) => t.id)
    expect(comPrazo).toEqual([credenciamento.id])
  })

  it('N23: município pelo nome inteiro (sem acento e sem caixa) ou pelo código do IBGE', async () => {
    const objeto = `Aquisição de ${palavra('smr')}`
    const rs = await registro('sm-rs', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto, ...(await local('Santa Maria', 'RS')), encerramentoAt: emDias(5), publicadoAt: emDias(-1) })
    const pr = await registro('sm-pr', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto, ...(await local('Santa Maria do Oeste', 'PR')), encerramentoAt: emDias(5), publicadoAt: emDias(-1) })
    const mg = await registro('sm-mg', { fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', objeto, ...(await local('Santa Maria do Suaçuí', 'MG')), encerramentoAt: emDias(5), publicadoAt: emDias(-1) })
    const ids = async (municipio: string) => (await listar(`q=${palavra('smr')}&municipio=${encodeURIComponent(municipio)}`)).map((t) => t.id).sort()
    expect(await ids('Santa Maria')).toEqual([rs.id])
    expect(await ids('SANTA MARIA DO SUACUI')).toEqual([mg.id])
    expect(await ids('santa maria do oeste')).toEqual([pr.id])
    expect(await ids(rs.municipioIbge)).toEqual([rs.id])
    expect(await ids('Santa')).toEqual([])
  })
})
