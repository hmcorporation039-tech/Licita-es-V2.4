import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NormalizedTender } from '../../src/types'

const URL_BANCO = process.env.TEST_DATABASE_URL
const rodar = describe.skipIf(!URL_BANCO)

rodar('Sistema S — duplicidade com o PNCP e gravação da nova fonte', () => {
  let duplicidade: typeof import('../../src/services/sistemaS/duplicidade')
  let tenders: typeof import('../../src/services/tenderService')
  let desconectar: () => void = () => undefined

  const sufixo = randomUUID().slice(0, 8)
  const agora = new Date()
  const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000)

  function doSenac(over: Partial<NormalizedTender> = {}): NormalizedTender {
    return {
      fonte: 'SISTEMA_S',
      fonteId: `SENAC-SC:${randomUUID()}`,
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ABERTA',
      objeto: `Contratação de empresa especializada para fornecimento e instalação de móveis sob medida para o auditório ${sufixo}`,
      uf: 'SC',
      orgao: 'SENAC-SC',
      aberturaAt: dias(5),
      encerramentoAt: dias(5),
      rawJson: { plataforma: 'SENAC', anexos: [] },
      ...over,
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_BANCO
    tenders = await import('../../src/services/tenderService')
    duplicidade = await import('../../src/services/sistemaS/duplicidade')
    const filas = await import('../../src/queues')
    desconectar = () => filas.redisConnection.disconnect()

    await tenders.prisma.tender.createMany({
      data: [
        {
          fonte: 'PNCP',
          fonteId: `pncp-ss-senac-${sufixo}`,
          modalidade: 'PREGAO_ELETRONICO',
          situacao: 'ABERTA',
          objeto: `CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA FORNECIMENTO E INSTALAÇÃO DE MÓVEIS SOB MEDIDA PARA O AUDITÓRIO ${sufixo}`,
          objetoNorm: `contratacao de empresa especializada para fornecimento e instalacao de moveis sob medida para o auditorio ${sufixo}`,
          uf: 'SC',
          orgao: 'SERVICO NACIONAL DE APRENDIZAGEM COMERCIAL - SENAC',
          orgaoNorm: 'servico nacional de aprendizagem comercial - senac',
          orgaoCnpj: '03603739000186',
          aberturaAt: dias(-9),
          encerramentoAt: dias(5),
          publicadoAt: dias(-9),
          rawJson: {},
        },
        {
          fonte: 'PNCP',
          fonteId: `pncp-ss-senai-${sufixo}`,
          modalidade: 'DISPENSA_SEM_DISPUTA',
          situacao: 'ABERTA',
          objeto: `Aquisição de reagentes para o laboratório de química verde ${sufixo}`,
          objetoNorm: `aquisicao de reagentes para o laboratorio de quimica verde ${sufixo}`,
          uf: 'RJ',
          orgao: 'DEPARTAMENTO REGIONAL DO RIO DE JANEIRO',
          orgaoNorm: 'departamento regional do rio de janeiro',
          orgaoCnpj: '03848688000152',
          aberturaAt: dias(-2),
          encerramentoAt: dias(3),
          publicadoAt: dias(-2),
          rawJson: {},
        },
      ],
    })
  }, 60_000)

  afterAll(async () => {
    await tenders?.prisma.tender.deleteMany({ where: { objeto: { contains: sufixo } } })
    desconectar()
    await tenders?.prisma.$disconnect()
  })

  it('reconhece o pregão do Senac que o PNCP já trouxe pelo nome por extenso do órgão', async () => {
    expect(await duplicidade.existeNoPncpSistemaS(doSenac(), agora)).toBe(true)
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ objeto: `Móveis sob medida do auditório ${sufixo}` }), agora)).toBe(true)
  })

  it('não descarta licitação diferente, de outra UF, de outra entidade ou de modalidade incompatível', async () => {
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ objeto: `Serviço de vigilância patrimonial armada ${sufixo}`, aberturaAt: dias(30) }), agora)).toBe(false)
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ uf: 'PR' }), agora)).toBe(false)
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ orgao: 'SESI-SC' }), agora)).toBe(false)
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ modalidade: 'CONCORRENCIA' }), agora)).toBe(false)
    expect(await duplicidade.existeNoPncpSistemaS(doSenac({ orgao: 'FIESC' }), agora)).toBe(false)
  })

  it('casa pela raiz do CNPJ mesmo quando o nome no PNCP não diz SENAI', async () => {
    const senaiRj = doSenac({
      fonteId: `IND-PDG-RJ-${sufixo}`,
      modalidade: 'DISPENSA_COM_DISPUTA',
      uf: 'RJ',
      orgao: 'SENAI-RJ',
      orgaoCnpj: '03848688006355',
      objeto: `Aquisição de reagentes para o laboratório de química verde ${sufixo}`,
    })
    expect(await duplicidade.existeNoPncpSistemaS(senaiRj, agora)).toBe(true)
    expect(await duplicidade.existeNoPncpSistemaS({ ...senaiRj, orgaoCnpj: undefined }, agora)).toBe(false)
  })

  it('grava a licitação com a nova fonte SISTEMA_S', async () => {
    const salvo = await tenders.saveTender(doSenac({ objeto: `Aquisição de uniformes ${sufixo}` }))
    expect(salvo.isNew).toBe(true)
    const lido = await tenders.prisma.tender.findUnique({ where: { id: salvo.tenderId }, select: { fonte: true, orgaoNorm: true } })
    expect(lido).toEqual({ fonte: 'SISTEMA_S', orgaoNorm: 'senac-sc' })
  })
})
