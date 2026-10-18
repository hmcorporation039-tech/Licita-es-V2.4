import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLUNAS_DA_LICITACAO, LeitorDeTabela, LicitacaoDoLicitaCon, licitacaoDaLinha } from '../../src/services/tceRsParser'
import { arquivoDoTceRs, caminhoDoAno, redeFalsaDoTceRs, zipDoTceRs } from '../helpers/tceRs'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

const PNCP_DE_IJUI = 'pncp-tce-rs-ijui'
const PNCP_DE_ESTRELA = '87246120000151-1-000202/2026'
const PNCP_DE_MARIANA = 'pncp-tce-rs-mariana'
const DO_PNCP = [PNCP_DE_IJUI, PNCP_DE_ESTRELA, PNCP_DE_MARIANA]

function licitacoesDaFixture(): LicitacaoDoLicitaCon[] {
  const itens: LicitacaoDoLicitaCon[] = []
  const leitor = new LeitorDeTabela(COLUNAS_DA_LICITACAO, (valor) => {
    const licitacao = licitacaoDaLinha(valor)
    if (licitacao) itens.push(licitacao)
  })
  leitor.ler(arquivoDoTceRs('licitacao.csv').toString('utf8'))
  leitor.terminar()
  return itens
}

rodar('TCE-RS — coleta gravando no banco', () => {
  let coletor: typeof import('../../src/workers/coletorTceRs')
  let tenders: typeof import('../../src/services/tenderService')
  let abertas: typeof import('../../src/lib/licitacaoAberta')
  let repeticoes: typeof import('../../src/services/duplicataEntreFontes')
  let desconectar: () => void = () => undefined

  const agora = new Date('2026-10-18T12:00:00Z')
  const fixture = licitacoesDaFixture()
  const objetoDe = (chave: string) => fixture.find((l) => l.chave === chave)?.objeto ?? ''
  const doBanco = (chave: string) => tenders.prisma.tender.findUnique({ where: { fonteId: `TCE-RS-${chave}` } })
  const rede = (zip = zipDoTceRs()) => redeFalsaDoTceRs({ [caminhoDoAno(2026)]: zip })
  const limpar = () => tenders.prisma.tender.deleteMany({ where: { OR: [{ fonte: 'TCE_RS' }, { fonteId: { in: DO_PNCP } }] } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    abertas = await import('../../src/lib/licitacaoAberta')
    repeticoes = await import('../../src/services/duplicataEntreFontes')
    coletor = await import('../../src/workers/coletorTceRs')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
    await limpar()
    await tenders.saveTender({
      fonte: 'PNCP',
      fonteId: PNCP_DE_IJUI,
      modalidade: 'PREGAO_PRESENCIAL',
      situacao: 'ABERTA',
      objeto: objetoDe('50100-2026-PCP-152'),
      uf: 'RS',
      municipio: 'Ijuí',
      municipioIbge: '4310207',
      orgao: 'MUNICIPIO DE IJUI',
      aberturaAt: new Date('2026-10-08T12:00:00Z'),
      encerramentoAt: new Date('2026-10-26T12:00:00Z'),
      publicadoAt: new Date('2026-10-08T12:00:00Z'),
      rawJson: { numeroCompra: '152', anoCompra: 2026, processo: '760/2026' },
    })
    await tenders.saveTender({
      fonte: 'PNCP',
      fonteId: PNCP_DE_ESTRELA,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: 'Sistema web integrado',
      uf: 'RS',
      municipio: 'Estrela',
      municipioIbge: '4307807',
      publicadoAt: new Date('2026-10-07T12:00:00Z'),
      encerramentoAt: new Date('2026-10-23T12:00:00Z'),
      rawJson: {},
    })
  }, 60_000)

  afterAll(async () => {
    await limpar()
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('grava as abertas fora do PNCP, descarta a que o PNCP já tem (pelo link e pelo texto) e conta como aberta até o dia da sessão', async () => {
    const resumo = await coletor.coletarDoTceRs(rede(), agora)

    expect(resumo).toMatchObject({ candidatas: 15, duplicadasPncpPorControle: 1, naoAbertas: 2, arquivosCompletos: true, falhas: [] })
    expect(resumo.duplicadasPncpPorObjeto + resumo.duplicadasPncpPorNumero).toBe(1)
    expect(resumo.totalNew).toBe(11)
    expect(await doBanco('50100-2026-PCP-152')).toBeNull()
    expect(await doBanco('47700-2026-PCE-26')).toBeNull()
    expect(await doBanco('54400-2026-PCE-28')).toBeNull()

    const portao = await doBanco('54800-2026-CCE-11')
    expect(portao).toMatchObject({
      fonte: 'TCE_RS',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      uf: 'RS',
      municipio: 'Portão',
      municipioNorm: 'portao',
      municipioIbge: '4314803',
      orgao: 'Prefeitura Municipal de Portão',
      numeroControle: '11/2026',
      encerramentoAt: null,
    })
    expect(Number(portao?.valorEstimado)).toBe(1329992.95)
    expect(portao?.aberturaAt?.toISOString()).toBe('2026-10-19T03:00:00.000Z')
    expect(((portao?.rawJson as { anexos?: { tipo: string }[] }).anexos ?? [])[0]?.tipo).toBe('EDI')

    const contadas = await tenders.prisma.tender.count({ where: { fonte: 'TCE_RS', ...abertas.whereLicitacaoAberta(agora) } })
    expect(contadas).toBe(11)
    expect(abertas.estaAberta(portao!, new Date('2026-10-19T23:30:00Z'))).toBe(true)
    expect(abertas.estaAberta(portao!, new Date('2026-10-20T03:00:00Z'))).toBe(false)
  })

  it('na coleta seguinte, sem mudança no arquivo, nada é novo nem alterado', async () => {
    const resumo = await coletor.coletarDoTceRs(rede(), agora)
    expect(resumo).toMatchObject({ totalNew: 0, totalUpdated: 0, revisitadas: 11, situacoesAlteradas: 0 })
  })

  it('a que foi para a habilitação sai das abertas', async () => {
    const csv = arquivoDoTceRs('licitacao.csv').toString('utf8')
    const linha = csv.split(/\r?\n/).find((l) => l.startsWith('54800,PM DE PORTÃO,11,2026,CCE,'))!
    const naHabilitacao = csv.replace(linha, linha.replace(/,EPU,/, ',HAP,'))
    const resumo = await coletor.coletarDoTceRs(rede(zipDoTceRs({ 'licitacao.csv': naHabilitacao })), agora)
    expect(resumo.situacoesAlteradas).toBe(1)
    const portao = await doBanco('54800-2026-CCE-11')
    expect(portao?.situacao).toBe('ENCERRADA')
    expect(portao?.situacaoCheckedAt).toEqual(agora)
    expect(await tenders.prisma.tender.count({ where: { fonte: 'TCE_RS', ...abertas.whereLicitacaoAberta(agora) } })).toBe(10)
  })

  it('o PNCP que chega depois esconde a do TCE-RS pela revisão comum', async () => {
    const mariana = await doBanco('77000-2026-PCE-28')
    expect(mariana?.duplicataDe).toBeNull()
    const pncp = {
      fonte: 'PNCP' as const,
      fonteId: PNCP_DE_MARIANA,
      modalidade: 'PREGAO_ELETRONICO' as const,
      situacao: 'ABERTA' as const,
      objeto: objetoDe('77000-2026-PCE-28'),
      uf: 'RS',
      municipio: 'Mariana Pimentel',
      municipioIbge: '4311981',
      orgao: 'MUNICIPIO DE MARIANA PIMENTEL',
      aberturaAt: new Date('2026-10-07T12:00:00Z'),
      encerramentoAt: new Date('2026-10-23T12:00:00Z'),
      publicadoAt: new Date('2026-10-07T12:00:00Z'),
      rawJson: { numeroCompra: '28', anoCompra: 2026, processo: '144/2026' },
    }
    const salvo = await tenders.saveTender(pncp)
    expect(await repeticoes.esconderRepeticoesDaLicitacaoDoPncp(salvo.tenderId, pncp, agora)).toBe(1)
    expect((await doBanco('77000-2026-PCE-28'))?.duplicataDe).toBe(salvo.tenderId)
    expect(await tenders.prisma.tender.count({ where: { fonte: 'TCE_RS', ...abertas.whereLicitacaoAberta(agora) } })).toBe(9)
  })
})
