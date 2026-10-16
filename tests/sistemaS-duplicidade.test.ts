import { describe, expect, it } from 'vitest'
import {
  CandidatoDoSistemaSNoPncp,
  ehMesmaLicitacaoDoSistemaS,
  entidadesDoOrgao,
  modalidadesComparaveisNoPncp,
  nomesDoOrgaoNoPncp,
  raizDoCnpj,
} from '../src/services/sistemaS/duplicidade'
import {
  dataDoPortal,
  entidadesDoNome,
  inicioDoDiaEmBrasilia,
  modalidadeDoSistemaS,
  orgaoDasEntidades,
  relogioLocalComoBrasilia,
  urlHttp,
} from '../src/services/sistemaS/comum'
import { anexosBaixaveis } from '../src/services/editalAnalysisService'
import { hostPermitido } from '../src/lib/urlGuard'
import { dataDaSessao } from '../src/lib/dataDaSessao'
import { NormalizedTender } from '../src/types'

function senac(over: Partial<NormalizedTender> = {}): NormalizedTender {
  return {
    fonte: 'SISTEMA_S',
    fonteId: 'SENAC-SC:3f953a98-a1a3-45bd-b00a-d8123c41b172',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'Contratação de empresa especializada para fornecimento e instalação de móveis sob medida para o auditório',
    uf: 'SC',
    orgao: 'SENAC-SC',
    aberturaAt: new Date('2026-10-20T14:00:00Z'),
    rawJson: {},
    ...over,
  }
}

function candidato(over: Partial<CandidatoDoSistemaSNoPncp> = {}): CandidatoDoSistemaSNoPncp {
  return {
    uf: 'SC',
    modalidade: 'PREGAO_ELETRONICO',
    orgaoNorm: 'servico nacional de aprendizagem comercial - senac',
    orgaoCnpj: '03603739000186',
    aberturaAt: new Date('2026-10-06T17:00:00Z'),
    encerramentoAt: new Date('2026-10-20T14:00:00Z'),
    similaridade: 0.5,
    ...over,
  }
}

describe('Sistema S — duplicidade com o PNCP', () => {
  it('reconhece a mesma licitação do Senac publicada no PNCP pelo nome por extenso', () => {
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato())).toBe(true)
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ orgaoNorm: 'servico nacional de aprendizagem comercial', similaridade: 0.46 }))).toBe(true)
  })

  it('com a sessão no mesmo dia, aceita objeto resumido de outro jeito', () => {
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ similaridade: 0.25 }))).toBe(true)
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ similaridade: 0.15 }))).toBe(false)
    const outroDia = candidato({ similaridade: 0.3, aberturaAt: new Date('2026-10-01T12:00:00Z'), encerramentoAt: new Date('2026-10-28T12:00:00Z') })
    expect(ehMesmaLicitacaoDoSistemaS(senac(), outroDia)).toBe(false)
  })

  it('não confunde com outra entidade, outra UF ou modalidade incompatível', () => {
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ orgaoNorm: 'servico social do comercio - sesc', orgaoCnpj: '03621867000105' }))).toBe(false)
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ orgaoNorm: 'municipio de florianopolis', orgaoCnpj: null }))).toBe(false)
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ uf: 'PR' }))).toBe(false)
    expect(ehMesmaLicitacaoDoSistemaS(senac(), candidato({ modalidade: 'CONCORRENCIA' }))).toBe(false)
    expect(ehMesmaLicitacaoDoSistemaS(senac({ uf: undefined }), candidato())).toBe(false)
  })

  it('casa pela raiz do CNPJ quando o portal informa (Firjan)', () => {
    const senaiRj = senac({ orgao: 'SENAI-RJ', orgaoCnpj: '03848688006355', uf: 'RJ', modalidade: 'DISPENSA_COM_DISPUTA' })
    const noPncp = candidato({ uf: 'RJ', modalidade: 'DISPENSA_SEM_DISPUTA', orgaoNorm: 'senai departamento regional', orgaoCnpj: '03848688000152' })
    expect(ehMesmaLicitacaoDoSistemaS(senaiRj, noPncp)).toBe(true)
    expect(ehMesmaLicitacaoDoSistemaS(senaiRj, { ...noPncp, orgaoNorm: 'outro orgao', orgaoCnpj: '11111111000191' })).toBe(false)
  })

  it('processo do regulamento próprio (OUTROS) compara com concorrência, pregão e outros', () => {
    expect(modalidadesComparaveisNoPncp('OUTROS')).toEqual(['OUTROS', 'CONCORRENCIA', 'PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL'])
    expect(modalidadesComparaveisNoPncp('PREGAO_PRESENCIAL')).toEqual(['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL'])
    const sesi = senac({ orgao: 'SESI/SENAI-PE', modalidade: 'OUTROS', uf: 'PE' })
    expect(ehMesmaLicitacaoDoSistemaS(sesi, candidato({ uf: 'PE', modalidade: 'CONCORRENCIA', orgaoNorm: 'servico social da industria - sesi' }))).toBe(true)
    expect(ehMesmaLicitacaoDoSistemaS(sesi, candidato({ uf: 'PE', modalidade: 'DISPENSA_SEM_DISPUTA', orgaoNorm: 'sesi' }))).toBe(false)
  })

  it('extrai as entidades do órgão; federação não tem equivalente no PNCP', () => {
    expect(entidadesDoOrgao('SESI/SENAI-MS')).toEqual(['SENAI', 'SESI'])
    expect(nomesDoOrgaoNoPncp('SENAC-DN')).toEqual(['senac', 'aprendizagem comercial'])
    expect(nomesDoOrgaoNoPncp('FIEMG')).toEqual([])
    expect(nomesDoOrgaoNoPncp('Sistema FIEAM')).toEqual([])
    expect(raizDoCnpj('03.848.688/0001-52')).toBe('03848688')
    expect(raizDoCnpj('123')).toBeNull()
  })
})

describe('Sistema S — datas, links e classificação', () => {
  it('converte relógio local com "Z" e datas do portal para o instante certo', () => {
    expect(relogioLocalComoBrasilia('2026-10-23T09:30:00Z')?.toISOString()).toBe('2026-10-23T12:30:00.000Z')
    expect(relogioLocalComoBrasilia('2026-10-26')?.toISOString()).toBe('2026-10-26T03:00:00.000Z')
    expect(relogioLocalComoBrasilia('2026-10-23T09:30:00-03:00')).toBeUndefined()
    expect(dataDoPortal('26/10/2026')?.toISOString()).toBe('2026-10-26T03:00:00.000Z')
    expect(dataDoPortal('2026-02-30')).toBeUndefined()
    expect(dataDoPortal('')).toBeUndefined()
    expect(inicioDoDiaEmBrasilia(new Date('2026-10-16T02:00:00Z')).toISOString()).toBe('2026-10-15T03:00:00.000Z')
  })

  it('só aceita link http(s) absoluto', () => {
    expect(urlHttp(' https://licitacoes-e2.bb.com.br')).toBe('https://licitacoes-e2.bb.com.br/')
    expect(urlHttp('www.licitanet.com.br')).toBeUndefined()
    expect(urlHttp('javascript:alert(1)')).toBeUndefined()
  })

  it('mapeia as modalidades do Sistema S', () => {
    expect(modalidadeDoSistemaS('Pregão eletrônico')).toBe('PREGAO_ELETRONICO')
    expect(modalidadeDoSistemaS('Pregão presencial')).toBe('PREGAO_PRESENCIAL')
    expect(modalidadeDoSistemaS('Concorrência')).toBe('CONCORRENCIA')
    expect(modalidadeDoSistemaS('Convite')).toBe('CONVITE')
    expect(modalidadeDoSistemaS('Credenciamento')).toBe('CREDENCIAMENTO')
    expect(modalidadeDoSistemaS('Leilão')).toBe('OUTROS')
    expect(modalidadeDoSistemaS('Processo de seleção sem disputa Processo de contratação')).toBe('DISPENSA_SEM_DISPUTA')
    expect(modalidadeDoSistemaS('Compra direta', 'Recebimento de lances')).toBe('DISPENSA_COM_DISPUTA')
    expect(modalidadeDoSistemaS('Dispensa', 'Em andamento')).toBe('DISPENSA_SEM_DISPUTA')
    expect(modalidadeDoSistemaS('RCA Disputa Aberta')).toBe('OUTROS')
  })

  it('classifica as empresas e monta o órgão', () => {
    expect(orgaoDasEntidades(entidadesDoNome('SESI E SENAI', 'FIEAM'), 'AM', 'FIEAM')).toBe('SESI/SENAI-AM')
    expect(orgaoDasEntidades(entidadesDoNome('SISTEMA FIEAM', 'FIEAM'), 'AM', 'FIEAM')).toBe('Sistema FIEAM')
    expect(orgaoDasEntidades(entidadesDoNome('SFIEMT', 'FIEMT'), 'MT', 'FIEMT')).toBe('FIEMT')
    expect(orgaoDasEntidades(entidadesDoNome('SESI/SENAI/IEL', 'CNI'), 'DN', 'CNI')).toBe('SESI/SENAI/IEL-DN')
    expect(orgaoDasEntidades(entidadesDoNome('Sindicato das Indústrias', 'FIEPA'), 'PA', 'FIEPA')).toBeUndefined()
  })

  it('a sessão do Sistema S vem na abertura', () => {
    const abertura = new Date('2026-10-26T03:00:00Z')
    expect(dataDaSessao({ fonte: 'SISTEMA_S', aberturaAt: abertura, encerramentoAt: null })).toBe(abertura)
  })
})

describe('Sistema S — documentos para a análise do edital', () => {
  it('libera só os hosts dos portais com PDF direto em https', () => {
    expect(hostPermitido('transparencia.senac.br')).toBe(true)
    expect(hostPermitido('licitacao.fiea.com.br')).toBe(true)
    expect(hostPermitido('static.portaldaindustria.com.br')).toBe(true)
    expect(hostPermitido('senac.br')).toBe(false)
    expect(hostPermitido('portaldaindustria.com.br')).toBe(false)
    expect(hostPermitido('compras.fiemg.com.br')).toBe(false)
  })

  it('filtra os anexos guardados na coleta: só https em host permitido', () => {
    const anexos = [
      { uri: 'https://transparencia.senac.br/service/api/licitacoes/a/regional/sc/documento/b/download', titulo: 'Edital - x.pdf' },
      { uri: 'http://licitacoes.rr.senai.br:8000/media/a.pdf', titulo: 'Edital' },
      { uri: 'https://evil.example/a.pdf', titulo: 'Edital' },
      { uri: 42, titulo: 'x' },
      null,
    ]
    expect(anexosBaixaveis(anexos).map((a) => a.titulo)).toEqual(['Edital - x.pdf'])
    expect(anexosBaixaveis(undefined)).toEqual([])
  })
})
