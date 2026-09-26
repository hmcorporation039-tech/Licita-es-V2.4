import { describe, expect, it } from 'vitest'
import {
  camposAlterados,
  snapshotDeTender,
  temAlteracaoRelevante,
  tenderContentHash,
} from '../src/lib/tenderContentHash'

const licitacao = {
  modalidade: 'PREGAO_ELETRONICO',
  objeto: 'Aquisição de notebook para uso administrativo',
  valorEstimado: 120000,
  uf: 'DF',
  municipio: 'Brasília',
  orgao: 'PREFEITURA MUNICIPAL',
  orgaoCnpj: '00000000000191',
  unidade: '153080',
  aberturaAt: new Date('2026-10-01T14:00:00.000Z'),
  encerramentoAt: new Date('2026-09-30T18:00:00.000Z'),
  publicadoAt: new Date('2026-09-15T09:00:00.000Z'),
  linkEdital: 'https://pncp.gov.br/edital/1',
  numeroControle: '00000000000191-1-000001/2026',
}

describe('tenderContentHash', () => {
  it('é estável para o mesmo conteúdo', () => {
    expect(tenderContentHash(licitacao)).toBe(tenderContentHash({ ...licitacao }))
  })

  it('ignora campos que não entram na comparação', () => {
    const comRuido = { ...licitacao, rawJson: { qualquer: 'coisa' }, updatedAt: new Date() }
    expect(tenderContentHash(comRuido)).toBe(tenderContentHash(licitacao))
  })

  // O P0-02: prorrogação de prazo precisa ser detectada, senão o cliente
  // continua vendo a data antiga e perde a licitação.
  it('muda quando o órgão prorroga o encerramento', () => {
    const prorrogada = { ...licitacao, encerramentoAt: new Date('2026-10-10T18:00:00.000Z') }
    expect(tenderContentHash(prorrogada)).not.toBe(tenderContentHash(licitacao))
  })

  it('trata número e Decimal-like com a mesma representação', () => {
    const comoDecimal = { ...licitacao, valorEstimado: { toString: () => '120000' } }
    expect(tenderContentHash(comoDecimal)).toBe(tenderContentHash(licitacao))
  })

  it('distingue campo ausente de string vazia apenas quando o valor muda', () => {
    const semLink = { ...licitacao, linkEdital: null }
    const semLinkUndefined = { ...licitacao, linkEdital: undefined }
    expect(tenderContentHash(semLink)).toBe(tenderContentHash(semLinkUndefined))
    expect(tenderContentHash(semLink)).not.toBe(tenderContentHash(licitacao))
  })

  it('não quebra com data inválida vinda da fonte', () => {
    const dataRuim = { ...licitacao, aberturaAt: new Date('nao e data') }
    expect(() => tenderContentHash(dataRuim)).not.toThrow()
  })
})

describe('camposAlterados', () => {
  it('lista exatamente o que mudou', () => {
    const depois = {
      ...licitacao,
      encerramentoAt: new Date('2026-10-10T18:00:00.000Z'),
      valorEstimado: 130000,
    }
    const campos = camposAlterados(snapshotDeTender(licitacao), snapshotDeTender(depois))
    expect(campos.sort()).toEqual(['encerramentoAt', 'valorEstimado'])
  })

  it('devolve vazio quando nada mudou', () => {
    expect(camposAlterados(snapshotDeTender(licitacao), snapshotDeTender({ ...licitacao }))).toEqual([])
  })
})

describe('temAlteracaoRelevante', () => {
  it('prazo e valor rendem aviso', () => {
    expect(temAlteracaoRelevante(['encerramentoAt'])).toBe(true)
    expect(temAlteracaoRelevante(['valorEstimado'])).toBe(true)
  })

  it('correção de grafia do órgão não rende aviso', () => {
    expect(temAlteracaoRelevante(['orgao'])).toBe(false)
    expect(temAlteracaoRelevante(['numeroControle', 'unidade'])).toBe(false)
  })
})
