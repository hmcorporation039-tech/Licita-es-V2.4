import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NormalizedTender } from '../../src/types'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Correção do fuso do PNCP na recoleta', () => {
  let tenders: typeof import('../../src/services/tenderService')
  let desconectar: () => void = () => undefined
  const sufixo = randomUUID().slice(0, 8)

  const licitacao = (over: Partial<NormalizedTender> = {}): NormalizedTender => ({
    fonte: 'PNCP',
    fonteId: `fuso-${sufixo}`,
    modalidade: 'PREGAO_ELETRONICO',
    objeto: `Aquisição de cadeiras ${sufixo}`,
    uf: 'MG',
    encerramentoAt: new Date('2026-11-03T08:29:00.000Z'),
    aberturaAt: new Date('2026-10-20T08:00:00.000Z'),
    rawJson: {},
    ...over,
  })

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    tenders = await import('../../src/services/tenderService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()
  })

  afterAll(async () => {
    await tenders.prisma.tender.deleteMany({ where: { fonteId: `fuso-${sufixo}` } })
    desconectar()
  })

  it('corrige o horário 3 horas adiantado sem tratar como alteração da licitação', async () => {
    expect((await tenders.saveTender(licitacao())).isNew).toBe(true)
    const corrigida = await tenders.saveTender(
      licitacao({ encerramentoAt: new Date('2026-11-03T11:29:00.000Z'), aberturaAt: new Date('2026-10-20T11:00:00.000Z') }),
    )
    expect(corrigida.changedFields).toEqual([])
    const gravada = await tenders.prisma.tender.findUniqueOrThrow({ where: { fonteId: `fuso-${sufixo}` } })
    expect(gravada.encerramentoAt?.toISOString()).toBe('2026-11-03T11:29:00.000Z')
  })

  it('mudança real de data continua sendo alteração', async () => {
    const mudou = await tenders.saveTender(licitacao({ encerramentoAt: new Date('2026-11-05T11:29:00.000Z'), aberturaAt: new Date('2026-10-20T11:00:00.000Z') }))
    expect(mudou.changedFields).toContain('encerramentoAt')
  })
})
