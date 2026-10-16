import { describe, expect, it } from 'vitest'
import {
  ajustarRepublicacao,
  caminhoDoArquivoDoDiario,
  ehMesmaLicitacaoDoPncp,
  janelaDoQueridoDiario,
  modalidadesEquivalentes,
  objetosCompativeis,
} from '../src/services/queridoDiarioService'
import { hostPermitido } from '../src/lib/urlGuard'
import { NormalizedTender } from '../src/types'

const AGORA = new Date('2026-10-15T20:00:00Z')

function tender(over: Partial<NormalizedTender> = {}): NormalizedTender {
  return {
    fonte: 'QUERIDO_DIARIO',
    fonteId: 'QD-2930105:PREGAO:65-2026',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'Aquisição de kits de materiais de uso pessoal destinados aos professores da rede municipal',
    aberturaAt: new Date('2026-10-23T12:00:00Z'),
    publicadoAt: new Date('2026-10-15T15:00:00Z'),
    linkEdital: 'https://data.queridodiario.ok.org.br/2930105/2026-10-15/b.pdf',
    rawJson: { gazetteUrl: 'https://data.queridodiario.ok.org.br/2930105/2026-10-15/b.pdf', date: '2026-10-15' },
    ...over,
  }
}

describe('Querido Diário — janela da coleta', () => {
  it('sem histórico, busca os últimos 5 dias', () => {
    expect(janelaDoQueridoDiario(AGORA, null)).toEqual({ publicadoDesde: '2026-10-10', publicadoAte: '2026-10-15' })
  })

  it('com histórico recente, nunca olha menos de 5 dias (o diário é indexado com atraso)', () => {
    expect(janelaDoQueridoDiario(AGORA, new Date('2026-10-14T15:00:00Z')).publicadoDesde).toBe('2026-10-10')
  })

  it('depois de uma parada, recomeça 2 dias antes da última publicação, com teto de 30 dias', () => {
    expect(janelaDoQueridoDiario(AGORA, new Date('2026-10-01T15:00:00Z')).publicadoDesde).toBe('2026-09-29')
    expect(janelaDoQueridoDiario(AGORA, new Date('2026-06-01T15:00:00Z')).publicadoDesde).toBe('2026-09-15')
  })
})

describe('Querido Diário — duplicidade com o PNCP', () => {
  it('trata pregão eletrônico e presencial, e as duas dispensas, como a mesma família', () => {
    expect(modalidadesEquivalentes('PREGAO_PRESENCIAL')).toEqual(['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL'])
    expect(modalidadesEquivalentes('DISPENSA_SEM_DISPUTA')).toEqual(['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'])
    expect(modalidadesEquivalentes('CONCORRENCIA')).toEqual(['CONCORRENCIA'])
  })

  it('é duplicada quando o objeto é parecido', () => {
    expect(ehMesmaLicitacaoDoPncp(tender(), { aberturaAt: null, encerramentoAt: null, similaridade: 0.62 })).toBe(true)
  })

  it('é duplicada quando a sessão cai no mesmo dia do PNCP e o objeto tem alguma semelhança', () => {
    const candidato = { aberturaAt: new Date('2026-10-14T13:00:00Z'), encerramentoAt: new Date('2026-10-23T11:00:00Z'), similaridade: 0.25 }
    expect(ehMesmaLicitacaoDoPncp(tender(), candidato)).toBe(true)
  })

  it('outra licitação do mesmo município no mesmo dia, com objeto diferente, não é descartada', () => {
    const candidato = { aberturaAt: new Date('2026-10-14T13:00:00Z'), encerramentoAt: new Date('2026-10-23T11:00:00Z'), similaridade: 0.08 }
    expect(ehMesmaLicitacaoDoPncp(tender(), candidato)).toBe(false)
  })

  it('compara o dia no fuso de Brasília', () => {
    const candidato = { aberturaAt: null, encerramentoAt: new Date('2026-10-24T02:00:00Z'), similaridade: 0.3 }
    expect(ehMesmaLicitacaoDoPncp(tender(), candidato)).toBe(true)
    const diaSeguinte = { aberturaAt: null, encerramentoAt: new Date('2026-10-24T03:30:00Z'), similaridade: 0.3 }
    expect(ehMesmaLicitacaoDoPncp(tender(), diaSeguinte)).toBe(false)
  })

  it('não é duplicada com objeto diferente e outra data', () => {
    const candidato = { aberturaAt: new Date('2026-10-01T13:00:00Z'), encerramentoAt: null, similaridade: 0.2 }
    expect(ehMesmaLicitacaoDoPncp(tender(), candidato)).toBe(false)
    expect(ehMesmaLicitacaoDoPncp(tender({ aberturaAt: undefined }), candidato)).toBe(false)
  })
})

describe('Querido Diário — republicação do mesmo aviso', () => {
  const existente = {
    objeto: 'Aquisição de kits de materiais de uso pessoal e funcional destinados aos professores',
    publicadoAt: new Date('2026-10-13T15:00:00Z'),
    linkEdital: 'http://doem.org.br/ba/senhordobonfim/editais',
    rawJson: { date: '2026-10-13' },
  }

  it('aviso novo passa direto', () => {
    expect(ajustarRepublicacao(tender(), null)).toEqual(tender())
  })

  it('republicação mais nova mantém a primeira publicação e o link do edital já conhecido', () => {
    const ajustado = ajustarRepublicacao(tender(), existente)
    expect(ajustado?.fonteId).toBe('QD-2930105:PREGAO:65-2026')
    expect(ajustado?.publicadoAt?.toISOString()).toBe('2026-10-13T15:00:00.000Z')
    expect(ajustado?.linkEdital).toBe('http://doem.org.br/ba/senhordobonfim/editais')
    expect(ajustado?.aberturaAt?.toISOString()).toBe('2026-10-23T12:00:00.000Z')
  })

  it('diário mais antigo que o já gravado não sobrescreve o registro', () => {
    const antigo = tender({ rawJson: { gazetteUrl: 'x', date: '2026-10-10' } })
    expect(ajustarRepublicacao(antigo, existente)).toBeNull()
  })

  it('mesmo número com objeto de outra licitação vira um registro separado e estável', () => {
    const outro = tender({ objeto: 'Contratação de empresa para pavimentação asfáltica de vias urbanas' })
    const a = ajustarRepublicacao(outro, existente)
    const b = ajustarRepublicacao(outro, existente)
    expect(a?.fonteId).toMatch(/^QD-2930105:PREGAO:65-2026:[0-9a-f]{8}$/)
    expect(a?.fonteId).toBe(b?.fonteId)
  })

  it('compara objetos pelas palavras significativas', () => {
    expect(objetosCompativeis('AQUISIÇÃO DE KITS DE MATERIAIS PARA PROFESSORES', 'Aquisição de kits de materiais destinados aos professores')).toBe(true)
    expect(objetosCompativeis('Aquisição de combustíveis', 'Reforma da quadra poliesportiva')).toBe(false)
  })
})

describe('Querido Diário — endereços', () => {
  it('só baixa texto do host de arquivos do Querido Diário, por https', () => {
    expect(caminhoDoArquivoDoDiario('https://data.queridodiario.ok.org.br/2930105/2026-10-13/a.txt')).toBe('/2930105/2026-10-13/a.txt')
    expect(caminhoDoArquivoDoDiario('http://data.queridodiario.ok.org.br/2930105/a.txt')).toBeNull()
    expect(caminhoDoArquivoDoDiario('https://169.254.169.254/latest/meta-data')).toBeNull()
    expect(caminhoDoArquivoDoDiario('não é url')).toBeNull()
  })

  it('libera o PDF do diário para a análise sem abrir o domínio inteiro', () => {
    expect(hostPermitido('data.queridodiario.ok.org.br')).toBe(true)
    expect(hostPermitido('queridodiario.ok.org.br')).toBe(false)
    expect(hostPermitido('evil-queridodiario.ok.org.br')).toBe(false)
  })
})
