import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RedeFalsaTcePi } from '../helpers/tcePi'
import { LinhaFalsaTcePi, TABELA, detalheFalso, linhasFalsas, pesquisaFalsa, publicacoesFalsas, redeFalsaTcePi, respostaParcial } from '../helpers/tcePi'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const QUADRA = 'CONTRATAÇÃO DE EMPRESA PARA CONSTRUÇÃO DE UMA QUADRA ESPORTIVA NA LOCALIDADE CAJÁS, ZONA RURAL DO MUNICÍPIO DE PAJEÚ DO PIAUÍ'
const GERENCIA = 'REFORMA E AMPLIAÇÃO DA SEDE DA 12ª GERÊNCIA REGIONAL DE EDUCAÇÃO EM PICOS'
const PNEUS = 'AQUISIÇÃO DE PNEUS, CÂMARAS DE AR E PROTETORES PARA A FROTA DE VEÍCULOS DA PREFEITURA'

const PAJEU: LinhaFalsaTcePi = { id: 601, procedimento: 'Concorrência nº 11/2026', modalidade: 'Concorrência', objeto: QUADRA, abertura: '03/11/2026 08:00', valor: '390.600,0000' }
const SEDUC: LinhaFalsaTcePi = {
  id: 602,
  orgao: 'SECRETARIA DE ESTADO DA EDUCACAO - SEDUC',
  esfera: 'ESTADUAL',
  procedimento: 'Concorrência nº 7/2026',
  modalidade: 'Concorrência',
  objeto: GERENCIA,
  abertura: '29/10/2026 09:00',
}
const AGUA_BRANCA: LinhaFalsaTcePi = { id: 603, orgao: 'P. M. DE AGUA BRANCA', procedimento: 'Pregão nº 30/2026', objeto: PNEUS, abertura: '05/11/2026 09:00', valor: '84.250,5000' }
const ALTOS: LinhaFalsaTcePi = { id: 604, orgao: 'CAMARA DE ALTOS', procedimento: 'Aviso de Dispensa nº 4/2026', modalidade: 'Aviso de Dispensa', objeto: 'LOCAÇÃO DE VEÍCULO PARA A CÂMARA', abertura: '25/10/2026 10:00' }

rodar('TCE-PI — coleta gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorTcePi')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let repeticoes: typeof import('../../src/services/duplicataEntreFontes')
  let normalize: (s: string) => string
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-18T15:00:00Z')
  const limites = { maxPaginas: 5, maxConsultasDePublicacao: 10, maxSumidas: 10, maxRequisicoes: 60 }
  const NO_PNCP = publicacoesFalsas(['Diário Oficial do Estado', 'PNCP (Portal Nacional de Contratações Públicas)'])

  function rede(linhas: LinhaFalsaTcePi[], detalhes: Record<number, string> = {}): RedeFalsaTcePi {
    return redeFalsaTcePi({
      pesquisa: pesquisaFalsa(linhas.length),
      paginas: { 0: respostaParcial({ [TABELA]: linhasFalsas(linhas) }) },
      publicacoes: { 602: NO_PNCP, 603: publicacoesFalsas(['Diário Oficial dos Municípios']) },
      detalhes,
    })
  }

  const doBanco = (id: number) => tenders.prisma.tender.findUnique({ where: { fonteId: `TCE-PI-${id}` } })
  const contadas = async () =>
    (await tenders.prisma.tender.findMany({ where: { fonte: 'TCE_PI', ...abertas.whereLicitacaoAberta(agora) }, select: { fonteId: true }, orderBy: { fonteId: 'asc' } })).map((t) => t.fonteId)

  async function pncp(fonteId: string, dados: { objeto: string; modalidade: 'CONCORRENCIA' | 'PREGAO_ELETRONICO'; orgao: string; municipio: string; ibge: string; encerramento: string; numero: string }) {
    return tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId,
        modalidade: dados.modalidade,
        situacao: 'ABERTA',
        objeto: dados.objeto,
        objetoNorm: normalize(dados.objeto),
        uf: 'PI',
        municipio: dados.municipio,
        municipioNorm: normalize(dados.municipio),
        municipioIbge: dados.ibge,
        orgao: dados.orgao,
        aberturaAt: new Date('2026-10-16T11:00:00Z'),
        encerramentoAt: new Date(dados.encerramento),
        publicadoAt: new Date('2026-10-16T13:00:00Z'),
        rawJson: { numeroCompra: dados.numero, anoCompra: '2026' },
      },
    })
  }

  const limpar = () => tenders.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'TCE_PI' }, { fonteId: { startsWith: 'pncp-tce-pi-' } }] } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    repeticoes = await import('../../src/services/duplicataEntreFontes')
    coletor = await import('../../src/workers/coletorTcePi')
    normalize = (await import('../../src/lib/geoService')).normalize
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await limpar()
    await pncp('pncp-tce-pi-quadra', { objeto: QUADRA, modalidade: 'CONCORRENCIA', orgao: 'MUNICIPIO DE PAJEU DO PIAUI', municipio: 'Pajeú do Piauí', ibge: '2207355', encerramento: '2026-11-03T11:00:00Z', numero: '11' })
    await pncp('pncp-tce-pi-gerencia', { objeto: GERENCIA, modalidade: 'CONCORRENCIA', orgao: 'PIAUI SECRETARIA DE EDUCACAO', municipio: 'Teresina', ibge: '2211001', encerramento: '2026-10-28T12:00:00Z', numero: '7' })
  }, 60_000)

  afterAll(async () => {
    await limpar()
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava as divulgadas fora do PNCP, descarta a repetida pela regra estrita, guarda oculta a que o TCE diz estar no PNCP e conta como aberta até a sessão', async () => {
    const resumo = await coletor.coletarDoTcePi(rede([PAJEU, SEDUC, AGUA_BRANCA, ALTOS]), agora, limites)

    expect(resumo).toMatchObject({ listaCompleta: true, comSessaoFutura: 4, municipios: 4, jaNoPncp: 1, jaNoPncpPeloMural: 1, novasForaDoPncp: 2, totalNew: 2, falhas: [] })
    expect(await doBanco(601)).toBeNull()

    const seduc = await doBanco(602)
    expect(seduc).toMatchObject({ motivoOculta: 'PUBLICADA_NO_PNCP', municipio: 'Teresina', unidade: 'SECRETARIA DE ESTADO DA EDUCACAO - SEDUC' })
    expect((seduc?.rawJson as { publicadoNoPncp?: boolean }).publicadoNoPncp).toBe(true)

    const aguaBranca = await doBanco(603)
    expect(aguaBranca).toMatchObject({
      fonte: 'TCE_PI',
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      uf: 'PI',
      municipio: 'Água Branca',
      municipioNorm: 'agua branca',
      municipioIbge: '2200202',
      orgao: 'Prefeitura Municipal de Água Branca',
      numeroControle: '30/2026',
      linkEdital: 'https://sistemas.tce.pi.gov.br/muralic/detalhelicitacao.xhtml?id=603',
      motivoOculta: null,
      duplicataDe: null,
    })
    expect(Number(aguaBranca?.valorEstimado)).toBe(84250.5)
    expect(aguaBranca?.aberturaAt?.toISOString()).toBe('2026-11-05T12:00:00.000Z')
    expect(aguaBranca?.encerramentoAt).toBeNull()
    expect(aguaBranca?.rawJson).toMatchObject({ publicadoNoPncp: false, processoAdministrativo: '603/2026' })
    expect(await doBanco(604)).toMatchObject({ orgao: 'Câmara Municipal de Altos', modalidade: 'DISPENSA_COM_DISPUTA', municipio: 'Altos' })

    expect(await contadas()).toEqual(['TCE-PI-603', 'TCE-PI-604'])
    expect(abertas.estaAberta(aguaBranca!, agora)).toBe(true)
    expect(abertas.estaAberta(aguaBranca!, new Date('2026-11-06T12:00:00Z'))).toBe(false)
  })

  it('na coleta seguinte, sem mudança na lista, só lê a lista: nada de detalhe nem gravação', async () => {
    const r = rede([PAJEU, SEDUC, AGUA_BRANCA, ALTOS])
    const resumo = await coletor.coletarDoTcePi(r, agora, limites)
    expect(r.pedidos.map((p) => p.metodo)).toEqual(['GET', 'POST', 'POST'])
    expect(resumo).toMatchObject({ totalNew: 0, revisitadas: 0, consultasDePublicacao: 0, jaNoPncp: 1 })
  })

  it('data remarcada atualiza a sessão; a que sumiu da lista e foi cancelada sai das abertas; a oculta não é conferida', async () => {
    const r = rede([PAJEU, { ...AGUA_BRANCA, abertura: '10/11/2026 09:00' }], { 604: detalheFalso('CANCELADA') })
    const resumo = await coletor.coletarDoTcePi(r, agora, limites)

    expect(resumo).toMatchObject({ revisitadas: 1, sumidas: 1, situacoesAlteradas: 1, totalUpdated: 1 })
    expect((await doBanco(603))?.aberturaAt?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(((await doBanco(603))?.rawJson as { assinaturaDaLista?: string }).assinaturaDaLista).toContain('10/11/2026')
    const altos = await doBanco(604)
    expect(altos?.situacao).toBe('CANCELADA')
    expect(altos?.situacaoCheckedAt).toEqual(agora)
    expect(r.pedidos.filter((p) => p.caminho.includes('detalhelicitacao')).map((p) => p.caminho)).toEqual(['/muralic/detalhelicitacao.xhtml?id=604'])
    expect(await contadas()).toEqual(['TCE-PI-603'])
  })

  it('quando a mesma licitação chega depois pelo PNCP, a do TCE-PI sai das abertas', async () => {
    const original = await pncp('pncp-tce-pi-pneus', {
      objeto: PNEUS,
      modalidade: 'PREGAO_ELETRONICO',
      orgao: 'MUNICIPIO DE AGUA BRANCA',
      municipio: 'Água Branca',
      ibge: '2200202',
      encerramento: '2026-11-10T12:00:00Z',
      numero: '30',
    })
    const escondidas = await repeticoes.esconderRepeticoesDaLicitacaoDoPncp(original.id, {
      fonte: 'PNCP',
      fonteId: original.fonteId,
      modalidade: 'PREGAO_ELETRONICO',
      objeto: PNEUS,
      uf: 'PI',
      municipio: 'Água Branca',
      municipioIbge: '2200202',
      orgao: 'MUNICIPIO DE AGUA BRANCA',
      aberturaAt: original.aberturaAt ?? undefined,
      encerramentoAt: original.encerramentoAt ?? undefined,
      rawJson: { numeroCompra: '30', anoCompra: '2026' },
    })
    expect(escondidas).toBe(1)
    expect((await doBanco(603))?.duplicataDe).toBe(original.id)
    expect(await contadas()).toEqual([])
  })
})
