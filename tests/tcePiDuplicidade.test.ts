import { describe, expect, it } from 'vitest'
import { gemeaDaPublicacaoNoPncp, repeticaoDoCandidatoTcePi } from '../src/services/tcePiDuplicidade'
import { ehRepeticaoDoCandidato, FONTES_QUE_REPETEM_O_PNCP, RegistroDeOutraFonte } from '../src/services/duplicataEntreFontes'
import { tenderDoTcePi } from '../src/services/tcePiParser'
import { CandidatoDoPncpNoMunicipio } from '../src/services/queridoDiarioService'
import { NormalizedTender } from '../src/types'

const LINHA = {
  idNoMural: 1175365,
  orgao: 'P. M. DE PAJEU DO PIAUI',
  esfera: 'MUNICIPAL',
  controleTce: 'LW-010651/26',
  procedimento: 'Concorrência nº 11/2026',
  processoAdministrativo: '0.010.00003435/2026',
  modalidade: 'Concorrência',
  formaDeRealizacao: 'Eletrônica',
  objeto: 'CONTRATAÇÃO DE EMPRESA PARA CONSTRUÇÃO DE UMA QUADRA ESPORTIVA NA LOCALIDADE CAJÁS',
  aberturaEm: '03/11/2026 08:00',
  status: 'Divulgada',
  ultimaPublicacaoEm: '17/10/2026',
  cadastroEm: '17/10/2026',
}

function tender(extra: Partial<typeof LINHA> = {}): NormalizedTender {
  const leitura = tenderDoTcePi({ ...LINHA, ...extra })
  if (leitura.tipo !== 'licitacao') throw new Error(leitura.motivo)
  return leitura.tender
}

function candidato(extra: Partial<CandidatoDoPncpNoMunicipio> = {}): CandidatoDoPncpNoMunicipio {
  return {
    id: 'pncp-1',
    modalidade: 'CONCORRENCIA',
    orgao: 'MUNICIPIO DE PAJEU DO PIAUI',
    objeto: 'Construção de quadra',
    aberturaAt: new Date('2026-10-17T11:00:00Z'),
    encerramentoAt: new Date('2026-11-03T11:00:00Z'),
    similaridade: 0.8,
    numeroCompra: '11',
    anoCompra: '2026',
    processo: '00003435/2026',
    ...extra,
  }
}

describe('TCE-PI — mesma licitação no PNCP (regra estrita)', () => {
  it('esconde com objeto parecido, mesmo número e mesmo dia na mesma prefeitura', () => {
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato()])?.id).toBe('pncp-1')
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ similaridade: 0.45, numeroCompra: '11' })])?.id).toBe('pncp-1')
  })

  it('não esconde com número diferente, dia diferente, outra modalidade ou órgão de outro tipo', () => {
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ numeroCompra: '12', processo: '999/2026' })])).toBeUndefined()
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ encerramentoAt: new Date('2026-11-02T11:00:00Z') })])).toBeUndefined()
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ modalidade: 'PREGAO_ELETRONICO' })])).toBeUndefined()
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ orgao: 'CAMARA MUNICIPAL DE PAJEU DO PIAUI' })])).toBeUndefined()
    expect(repeticaoDoCandidatoTcePi(tender(), [candidato({ similaridade: 0.3 })])).toBeUndefined()
  })
})

describe('TCE-PI — par no PNCP quando o próprio TCE informa a publicação no PNCP', () => {
  it('aceita objeto muito parecido mesmo com o órgão escrito de outro jeito ou o dia da sessão deslocado', () => {
    const estadual = tender({ orgao: 'SECRETARIA DE ESTADO DA EDUCACAO - SEDUC', esfera: 'ESTADUAL' })
    expect(gemeaDaPublicacaoNoPncp(estadual, [candidato({ orgao: 'PIAUI SECRETARIA DE EDUCACAO', similaridade: 1 })])?.id).toBe('pncp-1')
    expect(gemeaDaPublicacaoNoPncp(tender(), [candidato({ encerramentoAt: new Date('2026-11-02T11:00:00Z'), similaridade: 0.9 })])?.id).toBe('pncp-1')
  })

  it('não aceita objeto pouco parecido nem número claramente diferente', () => {
    expect(gemeaDaPublicacaoNoPncp(tender(), [candidato({ similaridade: 0.6 })])).toBeUndefined()
    expect(gemeaDaPublicacaoNoPncp(tender(), [candidato({ similaridade: 0.95, numeroCompra: '12', processo: '777/2026' })])).toBeUndefined()
  })
})

describe('TCE-PI — revisão das repetições na chegada do PNCP', () => {
  it('entra nas fontes que repetem o PNCP e compara o número do procedimento e do processo', () => {
    expect(FONTES_QUE_REPETEM_O_PNCP).toContain('TCE_PI')
    const t = tender()
    const registro: RegistroDeOutraFonte = {
      id: 'tce-1',
      fonte: 'TCE_PI',
      fonteId: t.fonteId,
      modalidade: t.modalidade,
      objeto: t.objeto,
      uf: 'PI',
      municipio: t.municipio ?? null,
      municipioIbge: t.municipioIbge ?? null,
      orgao: t.orgao ?? null,
      aberturaAt: t.aberturaAt ?? null,
      publicadoAt: t.publicadoAt ?? null,
      numeroControle: t.numeroControle ?? null,
      rawJson: t.rawJson as RegistroDeOutraFonte['rawJson'],
      createdAt: new Date('2026-10-17T12:00:00Z'),
    }
    expect(ehRepeticaoDoCandidato(registro, candidato({ similaridade: 0.45 }))).toBe(true)
    expect(ehRepeticaoDoCandidato(registro, candidato({ similaridade: 0.45, numeroCompra: '12', processo: '777/2026', encerramentoAt: new Date('2026-11-03T11:00:00Z') }))).toBe(false)
  })
})
