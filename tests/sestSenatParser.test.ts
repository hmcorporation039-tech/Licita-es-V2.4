import { describe, expect, it } from 'vitest'
import {
  RegistroSestSenat,
  filtrarRecentes,
  normalizarRegistroSestSenat,
  parseSestSenatDadosAbertos,
} from '../src/services/sestSenatParser'

function registro(over: Partial<RegistroSestSenat>): RegistroSestSenat {
  return {
    empresa: 'SEST',
    nomeFilial: 'DEX - SEST - BRASILIA/DF',
    modalidade: 'Pregao                                                 ',
    codigoEdital: '00007/2021',
    numeroProcesso: '000000005302020',
    objeto: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA\u0000',
    dataHomologacao: null,
    dataProposta: '06/05/2021',
    dataAbertura: null,
    valorProposta: 'R$ 45.000,00',
    valorVencido: 'R$ 0,00',
    situacao: 'Edital Encerrado',
    uf: null,
    ...over,
  }
}

describe('parseSestSenatDadosAbertos', () => {
  it('limpa byte de controle bruto antes do JSON.parse', () => {
    // \u0000 literal dentro da string, como a fonte real manda — JSON.parse puro rejeitaria isso.
    const bruto = '[{"objeto":"TESTE\u0000COM\u0000NULOS"}]'
    const resultado = parseSestSenatDadosAbertos(bruto)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].objeto).toBe('TESTECOMNULOS')
  })
})

describe('filtrarRecentes', () => {
  const anoAtual = new Date().getFullYear()

  it('mantém registro dentro do corte de anos', () => {
    const r = registro({ situacao: 'Edital Encerrado', dataHomologacao: `01/01/${anoAtual}` })
    expect(filtrarRecentes([r], 2)).toHaveLength(1)
  })

  it('descarta registro fora do corte de anos', () => {
    const r = registro({ situacao: 'Edital Encerrado', dataHomologacao: '01/01/2010' })
    expect(filtrarRecentes([r], 2)).toHaveLength(0)
  })

  it('nunca descarta edital em aberto, mesmo sem data ou antigo', () => {
    const semData = registro({ situacao: 'Edital Aberto', dataProposta: null, dataHomologacao: null })
    const antigo = registro({ situacao: 'Edital Aberto', dataHomologacao: '01/01/2010' })
    expect(filtrarRecentes([semData, antigo], 2)).toHaveLength(2)
  })

  it('mantém registro sem nenhuma data preenchida (não teria como filtrar)', () => {
    const r = registro({ situacao: 'Edital Encerrado', dataHomologacao: null, dataProposta: null, dataAbertura: null })
    expect(filtrarRecentes([r], 2)).toHaveLength(1)
  })
})

describe('normalizarRegistroSestSenat', () => {
  it('mapeia empresa, modalidade, CNPJ e UF corretamente', () => {
    const r = registro({})
    const tender = normalizarRegistroSestSenat(r)
    expect(tender.fonte).toBe('SEST_SENAT')
    expect(tender.fonteId).toBe('SESTSENAT-SEST-00007-2021')
    expect(tender.modalidade).toBe('PREGAO_ELETRONICO')
    expect(tender.orgaoCnpj).toBe('73471989000195')
    expect(tender.uf).toBe('DF')
    expect(tender.objeto).not.toContain('\u0000')
    expect(tender.valorEstimado).toBeCloseTo(45000)
    expect(tender.encerramentoAt?.toISOString().slice(0, 10)).toBe('2021-05-06')
  })

  it('usa o CNPJ certo pro SENAT', () => {
    const tender = normalizarRegistroSestSenat(registro({ empresa: 'SENAT' }))
    expect(tender.orgaoCnpj).toBe('73471963000147')
    expect(tender.orgao).toContain('SENAT')
  })

  it('cai em OUTROS pra modalidade não mapeada', () => {
    const tender = normalizarRegistroSestSenat(registro({ modalidade: 'Algo Nunca Visto' }))
    expect(tender.modalidade).toBe('OUTROS')
  })

  // O servidor às vezes devolve as duas empresas misturadas mesmo pedindo
  // filtro de uma só (ver aviso no topo do parser) — a rotulagem tem que
  // vir do campo do registro, nunca do que foi pedido no filtro.
  it('rotula pelo campo do próprio registro, ignorando qualquer suposição externa', () => {
    const senatRow = registro({ empresa: 'SENAT SERVICO NACIONAL DE APRENDIZAGEM DO TRANSPORTE' })
    expect(normalizarRegistroSestSenat(senatRow).orgaoCnpj).toBe('73471963000147')

    const sestRow = registro({ empresa: 'SEST' })
    expect(normalizarRegistroSestSenat(sestRow).orgaoCnpj).toBe('73471989000195')
  })
})
