import { describe, expect, it } from 'vitest'
import {
  RegistroSestSenat,
  codigoFilialSestSenat,
  deduplicarPorFonteId,
  empresaPorCnpjSestSenat,
  filtrarSomenteAbertos,
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

describe('filtrarSomenteAbertos', () => {
  it('mantém só "Edital Aberto"', () => {
    const r = registro({ situacao: 'Edital Aberto' })
    expect(filtrarSomenteAbertos([r])).toHaveLength(1)
  })

  // Licitação encerrada/executada não deve entrar no sistema — mesmo
  // princípio em qualquer outra fonte (ver sescGoParser.ts, fiegParser.ts,
  // novacapParser.ts). Cobre todos os valores reais de `situacao` vistos
  // em produção que NÃO são "Edital Aberto".
  it.each([
    'Anulado',
    'Edital Encerrado',
    'Edital Fracassado',
    'Edital Impugnado',
    'Edital Remanescente',
    'Processo Licitatório Cancelado',
    'Processo Licitatório Revogado',
  ])('descarta situação "%s"', (situacao) => {
    expect(filtrarSomenteAbertos([registro({ situacao })])).toHaveLength(0)
  })

  it('descarta mesmo sem nenhuma data preenchida — a situação decide, não a data', () => {
    const r = registro({ situacao: 'Edital Encerrado', dataHomologacao: null, dataProposta: null, dataAbertura: null })
    expect(filtrarSomenteAbertos([r])).toHaveLength(0)
  })
})

describe('normalizarRegistroSestSenat', () => {
  it('mapeia empresa, modalidade, CNPJ e UF corretamente', () => {
    const r = registro({})
    const tender = normalizarRegistroSestSenat(r)
    expect(tender.fonte).toBe('SEST_SENAT')
    expect(tender.fonteId).toBe('SESTSENAT-SEST-DEX-00007-2021')
    expect(tender.modalidade).toBe('PREGAO_ELETRONICO')
    expect(tender.orgaoCnpj).toBe('73471989000195')
    expect(tender.uf).toBe('DF')
    expect(tender.objeto).not.toContain('\u0000')
    expect(tender.valorEstimado).toBeCloseTo(45000)
    expect(tender.encerramentoAt?.toISOString().slice(0, 10)).toBe('2021-05-06')
  })

  it('guarda a data de abertura da sessão quando o portal informa', () => {
    expect(normalizarRegistroSestSenat(registro({ dataProposta: null, dataAbertura: '20/10/2026 09:00' })).aberturaAt?.toISOString()).toBe('2026-10-20T12:00:00.000Z')
    expect(normalizarRegistroSestSenat(registro({})).aberturaAt).toBeUndefined()
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

describe('fonteId por filial', () => {
  it('extrai o código da filial antes do primeiro separador', () => {
    expect(codigoFilialSestSenat('A 003 - SEST - CUIABA/MT')).toBe('A-003')
    expect(codigoFilialSestSenat('DN 146 - SEST - ITUIUTABA/MG')).toBe('DN-146')
    expect(codigoFilialSestSenat('')).toBe('SEM-FILIAL')
    expect(codigoFilialSestSenat(null)).toBe('SEM-FILIAL')
  })

  it('não junta o mesmo código de edital publicado por filiais diferentes', () => {
    const cuiaba = normalizarRegistroSestSenat(registro({ nomeFilial: 'A 003 - SEST - CUIABA/MT', codigoEdital: 'DL 0052/2024' }))
    const araraquara = normalizarRegistroSestSenat(registro({ nomeFilial: 'B 030 - SEST - ARARAQUARA/SP', codigoEdital: 'DL 0052/2024' }))
    expect(cuiaba.fonteId).toBe('SESTSENAT-SEST-A-003-DL-0052-2024')
    expect(araraquara.fonteId).not.toBe(cuiaba.fonteId)
  })

  it('identifica a empresa pelo CNPJ gravado', () => {
    expect(empresaPorCnpjSestSenat('73471989000195')).toBe('SEST')
    expect(empresaPorCnpjSestSenat('73471963000147')).toBe('SENAT')
    expect(empresaPorCnpjSestSenat('00000000000000')).toBeNull()
  })
})

describe('deduplicarPorFonteId', () => {
  const base = registro({ situacao: 'Edital Aberto', nomeFilial: 'B 045 - SEST - FEIRA DE SANTANA/BA', codigoEdital: 'DL004386-7/2026' })

  it('escolhe o mesmo registro qualquer que seja a ordem de chegada', () => {
    const a = normalizarRegistroSestSenat({ ...base, objeto: 'CONFECÇÃO DE 1.200 MEDALHAS', dataProposta: '10/10/2026' })
    const b = normalizarRegistroSestSenat({ ...base, objeto: 'CONFECÇÃO DE 1.200 (MIL E DUZENTOS) MEDALHAS', dataProposta: '10/10/2026' })
    const ida = deduplicarPorFonteId([a, b])
    const volta = deduplicarPorFonteId([b, a])
    expect(ida).toHaveLength(1)
    expect(ida[0].objeto).toBe(volta[0].objeto)
  })

  it('prefere o registro com encerramento mais recente', () => {
    const antigo = normalizarRegistroSestSenat({ ...base, objeto: 'VERSAO ANTIGA', dataProposta: '01/10/2026' })
    const novo = normalizarRegistroSestSenat({ ...base, objeto: 'VERSAO NOVA', dataProposta: '20/10/2026' })
    expect(deduplicarPorFonteId([novo, antigo])[0].objeto).toBe('VERSAO NOVA')
  })
})
