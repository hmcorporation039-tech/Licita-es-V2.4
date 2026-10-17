import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import type { NormalizedTender } from '../../src/types'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('PNCP: retenção x recoleta, gravação da varredura e cobertura municipal', () => {
  let tenders: typeof import('../../src/services/tenderService')
  let retencao: typeof import('../../src/lib/retencao')
  let coletor: typeof import('../../src/workers/coletorPNCP')
  let cobertura: typeof import('../../src/services/coberturaMunicipal')
  let pncp: typeof import('../../src/services/pncpColeta')
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)
  const prefixo = `reforco-${sufixo}-`
  const agora = new Date()
  const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000)

  const licitacao = (id: string, over: Partial<NormalizedTender> = {}): NormalizedTender => ({
    fonte: 'PNCP',
    fonteId: `${prefixo}${id}`,
    modalidade: 'PREGAO_ELETRONICO',
    objeto: `Aquisição de cadeiras ${sufixo} ${id}`,
    uf: 'MG',
    publicadoAt: dias(-1),
    encerramentoAt: dias(10),
    rawJson: {},
    ...over,
  })

  const regrasDaRetencao = (): Prisma.TenderWhereInput => ({
    OR: [retencao.whereEncerradaParaRetencao(agora), retencao.WHERE_HOMOLOGADA_PARA_RETENCAO],
  })

  const simularRetencao = (fonteId: string) =>
    tenders.prisma.tender.deleteMany({ where: { AND: [regrasDaRetencao(), { fonteId }, { tenderMatches: { none: {} } }] } })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    process.env.QUEUE_ENQUEUE_TIMEOUT_MS = '300'
    tenders = await import('../../src/services/tenderService')
    retencao = await import('../../src/lib/retencao')
    coletor = await import('../../src/workers/coletorPNCP')
    cobertura = await import('../../src/services/coberturaMunicipal')
    pncp = await import('../../src/services/pncpColeta')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
  }, 30_000)

  afterAll(async () => {
    await tenders.prisma.tender.deleteMany({ where: { fonteId: { startsWith: prefixo } } })
    desconectar()
  })

  it('confirma o ciclo: a retenção apaga a que chega encerrada e a recoleta seguinte a insere como nova de novo', async () => {
    const encerrada = licitacao('ciclo', { encerramentoAt: dias(-2), publicadoAt: dias(-1) })
    expect((await tenders.saveTender(encerrada)).isNew).toBe(true)
    expect((await simularRetencao(encerrada.fonteId)).count).toBe(1)
    expect((await tenders.saveTender(encerrada)).isNew).toBe(true)
    expect((await simularRetencao(encerrada.fonteId)).count).toBe(1)

    expect(await tenders.saveTenderSeAindaServir(encerrada, agora)).toBeNull()
    expect(await tenders.prisma.tender.count({ where: { fonteId: encerrada.fonteId } })).toBe(0)
  })

  it('a regra em memória concorda com o filtro da retenção no banco', async () => {
    const casos: Record<string, Partial<NormalizedTender>> = {
      aberta: {},
      prazoVencido: { encerramentoAt: dias(-1) },
      homologadaPncp: { valorHomologado: 1000 },
      homologadaComprasnet: { fonte: 'COMPRASNET', valorHomologado: 1000 },
      semDatas: { encerramentoAt: undefined, publicadoAt: undefined },
    }
    for (const [nome, over] of Object.entries(casos)) {
      const t = licitacao(`regra-${nome}`, over)
      const { tenderId } = await tenders.saveTender(t)
      const noBanco = await tenders.prisma.tender.count({ where: { AND: [regrasDaRetencao(), { id: tenderId }] } })
      expect({ nome, apagaria: retencao.retencaoApagariaAoChegar(t, agora) }).toEqual({ nome, apagaria: noBanco === 1 })
    }
  })

  it('licitação que já existe continua sendo atualizada mesmo depois de encerrar', async () => {
    const aberta = licitacao('existente')
    expect((await tenders.saveTenderSeAindaServir(aberta, agora))?.isNew).toBe(true)
    const prorrogadaParaTras = await tenders.saveTenderSeAindaServir({ ...aberta, encerramentoAt: dias(-1) }, agora)
    expect(prorrogadaParaTras?.changed).toBe(true)
    expect(prorrogadaParaTras?.changedFields).toContain('encerramentoAt')
  })

  it('gravação do PNCP: nova entra e enfileira, homologada nova é descartada, repetida não conta como nova', async () => {
    const bruto = (numero: string, over: Record<string, unknown> = {}) => ({
      numeroControlePNCP: `${prefixo}${numero}`,
      modalidadeId: 6,
      objetoCompra: `Aquisição de mesas ${sufixo}`,
      orgaoEntidade: { cnpj: '00000000000191', razaoSocial: 'MUNICIPIO X', esferaId: 'M' },
      unidadeOrgao: { ufSigla: 'MG', municipioNome: 'Uberlândia', codigoIbge: '3170206' },
      anoCompra: 2026,
      sequencialCompra: 7,
      dataPublicacaoPncp: '2026-10-10T09:00:00',
      dataEncerramentoProposta: dias(15).toISOString().slice(0, 19),
      situacaoCompraId: 1,
      ...over,
    })

    const primeira = pncp.contadoresZerados()
    await coletor.gravarContratacoesPncp([bruto('g-aberta'), bruto('g-homologada', { valorTotalHomologado: 900 })], primeira, 'teste')
    expect(primeira).toMatchObject({ vistos: 2, novos: 1, descartados: 1, comErro: 0 })

    const segunda = pncp.contadoresZerados()
    await coletor.gravarContratacoesPncp([bruto('g-aberta'), bruto('g-homologada', { valorTotalHomologado: 900 })], segunda, 'teste')
    expect(segunda).toMatchObject({ vistos: 2, novos: 0, inalterados: 1, descartados: 1 })

    const gravada = await tenders.prisma.tender.findUniqueOrThrow({ where: { fonteId: `${prefixo}g-aberta` } })
    expect(gravada.municipioIbge).toBe('3170206')
    expect(gravada.rawJson).toMatchObject({ orgaoEntidade: { cnpj: '00000000000191', esferaId: 'M' } })
  }, 15_000)

  it('cobertura: conta municípios distintos com licitação ABERTA por UF', async () => {
    const ibge = (n: number) => `9${sufixo.replace(/\D/g, '0').slice(0, 5)}${n}`
    await tenders.saveTender(licitacao('cob-1', { uf: 'ZZ', municipioIbge: ibge(1) }))
    await tenders.saveTender(licitacao('cob-1b', { uf: 'ZZ', municipioIbge: ibge(1) }))
    await tenders.saveTender(licitacao('cob-2', { uf: 'ZZ', municipioIbge: ibge(2) }))
    await tenders.saveTender(licitacao('cob-3', { uf: 'ZZ', municipioIbge: ibge(3), encerramentoAt: dias(-1) }))

    const resultado = await cobertura.municipiosComLicitacaoAbertaPorUf(agora)
    expect(resultado.porUf.find((u) => u.uf === 'ZZ')).toEqual({ uf: 'ZZ', municipios: 2 })
    expect(resultado.totalDeMunicipios).toBeGreaterThanOrEqual(2)
  })
})
