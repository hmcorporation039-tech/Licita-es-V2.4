import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NormalizedTender } from '../../src/types'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Querido Diário — duplicidade com o PNCP e republicação', () => {
  let servico: typeof import('../../src/services/queridoDiarioService')
  let tenders: typeof import('../../src/services/tenderService')
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const ibge = `99${sufixo.replace(/\D/g, '').padEnd(5, '0').slice(0, 5)}`
  const agora = new Date()
  const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000)

  function doDiario(over: Partial<NormalizedTender> = {}): NormalizedTender {
    return {
      fonte: 'QUERIDO_DIARIO',
      fonteId: `QD-${ibge}:PREGAO:65-2026-${sufixo}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: `Aquisição de kits de materiais de uso pessoal destinados aos professores da rede municipal ${sufixo}`,
      uf: 'BA',
      municipio: `Cidade ${sufixo}`,
      municipioIbge: ibge,
      aberturaAt: dias(10),
      publicadoAt: dias(-1),
      linkEdital: 'https://data.queridodiario.ok.org.br/x/a.pdf',
      rawJson: { gazetteUrl: 'https://data.queridodiario.ok.org.br/x/a.pdf', date: dias(-1).toISOString().slice(0, 10) },
      ...over,
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    tenders = await import('../../src/services/tenderService')
    servico = await import('../../src/services/queridoDiarioService')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    await tenders.prisma.tender.create({
      data: {
        fonte: 'PNCP',
        fonteId: `pncp-qd-${sufixo}`,
        modalidade: 'PREGAO_PRESENCIAL',
        situacao: 'ABERTA',
        objeto: `AQUISIÇÃO DE KITS DE MATERIAIS DE USO PESSOAL DESTINADOS AOS PROFESSORES ${sufixo}`,
        objetoNorm: `aquisicao de kits de materiais de uso pessoal destinados aos professores ${sufixo}`,
        uf: 'BA',
        municipio: `Cidade ${sufixo}`,
        municipioNorm: `cidade ${sufixo}`,
        municipioIbge: ibge,
        aberturaAt: dias(-2),
        encerramentoAt: dias(20),
        publicadoAt: dias(-2),
        rawJson: {},
      },
    })
  }, 60_000)

  afterAll(async () => {
    await tenders?.prisma.tender.deleteMany({ where: { OR: [{ fonteId: { contains: sufixo } }, { municipioIbge: ibge }] } })
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('reconhece o aviso que o PNCP já trouxe pelo objeto parecido', async () => {
    expect(await servico.existeNoPncp(doDiario(), agora)).toBe(true)
  })

  it('reconhece pelo mesmo dia da sessão mesmo com objeto diferente', async () => {
    const aviso = doDiario({ objeto: 'Contratação de serviço de transporte escolar', aberturaAt: dias(20) })
    expect(await servico.existeNoPncp(aviso, agora)).toBe(true)
  })

  it('não confunde com outra licitação do município, de outra modalidade ou de outro lugar', async () => {
    const outraLicitacao = doDiario({ objeto: 'Contratação de serviço de transporte escolar', aberturaAt: dias(5) })
    expect(await servico.existeNoPncp(outraLicitacao, agora)).toBe(false)
    expect(await servico.existeNoPncp(doDiario({ modalidade: 'CONCORRENCIA' }), agora)).toBe(false)
    expect(await servico.existeNoPncp(doDiario({ uf: 'SE' }), agora)).toBe(false)
    expect(await servico.existeNoPncp(doDiario({ municipioIbge: '1100015', municipio: 'Outra' }), agora)).toBe(false)
  })

  it('republicação mais antiga não sobrescreve e mais nova preserva a primeira publicação', async () => {
    const original = doDiario({ objeto: `Reforma da quadra poliesportiva do centro esportivo ${sufixo}`, fonteId: `QD-${ibge}:CONCORRENCIA:13-2026-${sufixo}`, modalidade: 'CONCORRENCIA' })
    const salvo = await tenders.saveTender((await servico.prepararRepublicacao(original))!)
    expect(salvo.isNew).toBe(true)

    const antigo = { ...original, aberturaAt: dias(3), rawJson: { ...original.rawJson, date: dias(-5).toISOString().slice(0, 10) } }
    expect(await servico.prepararRepublicacao(antigo)).toBeNull()

    const novo = { ...original, aberturaAt: dias(15), publicadoAt: dias(0), rawJson: { ...original.rawJson, date: dias(0).toISOString().slice(0, 10) } }
    const ajustado = (await servico.prepararRepublicacao(novo))!
    expect(ajustado.publicadoAt?.toISOString()).toBe(original.publicadoAt?.toISOString())
    const atualizado = await tenders.saveTender(ajustado)
    expect(atualizado.isNew).toBe(false)
    expect(atualizado.changedFields).toContain('aberturaAt')

    const outroObjeto = { ...original, objeto: 'Aquisição de medicamentos para a farmácia básica municipal' }
    const separado = (await servico.prepararRepublicacao(outroObjeto))!
    expect(separado.fonteId).not.toBe(original.fonteId)
    expect((await tenders.saveTender(separado)).isNew).toBe(true)
  })
})
