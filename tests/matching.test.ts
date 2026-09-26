import { describe, expect, it } from 'vitest'
import {
  CODE_MATCH_SCORE,
  KEYWORD_MATCH_SCORE,
  buildKeywordRegex,
  compileKeywordPatterns,
  keywordFoundIn,
  matchedKeywords,
  orgaoMatches,
  passaNosPortoes,
  scoreDoMatch,
  uasgMatches,
} from '../src/lib/matching'

const tenderBase = {
  fonte: 'PNCP',
  uf: 'DF',
  modalidade: 'PREGAO_ELETRONICO',
  orgao: 'PREFEITURA MUNICIPAL DE UBERLÂNDIA',
  unidade: null,
  valorEstimado: 50_000,
  municipioLat: -15.79,
  municipioLng: -47.88,
}

const gatesBase = {
  ufs: [],
  modalidades: [],
  orgaos: [],
  uasgCodes: [],
  valorMin: null,
  valorMax: null,
  raioKm: null,
  origemLat: null,
  origemLng: null,
}

describe('buildKeywordRegex', () => {
  it('casa a palavra inteira ignorando acento e caixa', () => {
    const re = buildKeywordRegex('CIRÚRGICO')!
    expect(re.test('material cirurgico hospitalar')).toBe(true)
  })

  it('respeita borda de palavra — foi o motivo de abandonar trigramas', () => {
    const re = buildKeywordRegex('cat6')!
    expect(re.test('cateterismo cardiaco')).toBe(false)
    expect(re.test('cabo de rede cat6 homologado')).toBe(true)
  })

  it('não casa plural, porque o critério é literal', () => {
    const re = buildKeywordRegex('notebook')!
    expect(re.test('aquisicao de notebooks')).toBe(false)
    expect(re.test('aquisicao de notebook')).toBe(true)
  })

  it('trata caractere especial de regex como texto literal', () => {
    const re = buildKeywordRegex('c++')!
    expect(re).not.toBeNull()
    expect(() => re.test('curso de c++ avancado')).not.toThrow()
  })

  it('devolve null para palavra-chave vazia ou só espaço', () => {
    expect(buildKeywordRegex('')).toBeNull()
    expect(buildKeywordRegex('   ')).toBeNull()
  })
})

describe('keywordFoundIn', () => {
  const re = buildKeywordRegex('seringa')!

  it('encontra no objeto', () => {
    expect(keywordFoundIn(re, 'aquisicao de seringa descartavel', [])).toBe(true)
  })

  it('encontra na descrição de um item mesmo fora do objeto', () => {
    expect(keywordFoundIn(re, 'material hospitalar diverso', ['seringa 10ml'])).toBe(true)
  })

  it('não encontra quando não aparece em lugar nenhum', () => {
    expect(keywordFoundIn(re, 'material hospitalar', ['luva de procedimento'])).toBe(false)
  })
})

describe('matchedKeywords', () => {
  it('devolve só as palavras que realmente apareceram', () => {
    const patterns = compileKeywordPatterns(['notebook', 'impressora', 'monitor'])
    expect(matchedKeywords(patterns, 'compra de notebook e monitor', [])).toEqual(['notebook', 'monitor'])
  })

  it('descarta palavra-chave vazia sem quebrar', () => {
    const patterns = compileKeywordPatterns(['', 'notebook'])
    expect(patterns).toHaveLength(1)
  })
})

describe('orgaoMatches', () => {
  it('sem filtro, qualquer órgão passa', () => {
    expect(orgaoMatches([], 'QUALQUER COISA')).toBe(true)
    expect(orgaoMatches([], null)).toBe(true)
  })

  it('com filtro, licitação sem órgão é reprovada', () => {
    expect(orgaoMatches(['PREFEITURA'], null)).toBe(false)
  })

  it('casa por categoria e por nome específico', () => {
    expect(orgaoMatches(['PREFEITURA'], 'PREFEITURA MUNICIPAL DE UBERLÂNDIA')).toBe(true)
    expect(orgaoMatches(['UNIVERSIDADE FEDERAL'], 'PREFEITURA MUNICIPAL DE UBERLÂNDIA')).toBe(false)
  })
})

describe('uasgMatches', () => {
  it('não restringe o PNCP, que não usa UASG', () => {
    expect(uasgMatches(['153080'], 'PNCP', null)).toBe(true)
  })

  it('restringe o ComprasNet pelo código exato', () => {
    expect(uasgMatches(['153080'], 'COMPRASNET', '153080')).toBe(true)
    expect(uasgMatches(['153080'], 'COMPRASNET', '999999')).toBe(false)
    expect(uasgMatches(['153080'], 'COMPRASNET', null)).toBe(false)
  })
})

describe('passaNosPortoes', () => {
  it('passa sem nenhum filtro configurado', () => {
    expect(passaNosPortoes(gatesBase, tenderBase)).toBe(true)
  })

  it('reprova UF fora da lista', () => {
    expect(passaNosPortoes({ ...gatesBase, ufs: ['GO'] }, tenderBase)).toBe(false)
    expect(passaNosPortoes({ ...gatesBase, ufs: ['DF', 'GO'] }, tenderBase)).toBe(true)
  })

  it('reprova licitação sem UF quando há filtro de UF', () => {
    expect(passaNosPortoes({ ...gatesBase, ufs: ['DF'] }, { ...tenderBase, uf: null })).toBe(false)
  })

  it('aplica a faixa de valor', () => {
    expect(passaNosPortoes({ ...gatesBase, valorMin: 60_000 }, tenderBase)).toBe(false)
    expect(passaNosPortoes({ ...gatesBase, valorMax: 40_000 }, tenderBase)).toBe(false)
    expect(passaNosPortoes({ ...gatesBase, valorMin: 10_000, valorMax: 90_000 }, tenderBase)).toBe(true)
  })

  it('não reprova por faixa quando a licitação não informa valor', () => {
    const semValor = { ...tenderBase, valorEstimado: null }
    expect(passaNosPortoes({ ...gatesBase, valorMin: 60_000 }, semValor)).toBe(true)
  })

  it('aplica o filtro de modalidade', () => {
    expect(passaNosPortoes({ ...gatesBase, modalidades: ['DISPENSA_SEM_DISPUTA'] }, tenderBase)).toBe(false)
    expect(passaNosPortoes({ ...gatesBase, modalidades: ['PREGAO_ELETRONICO'] }, tenderBase)).toBe(true)
  })

  it('aplica o raio de distância', () => {
    const emBrasilia = { ...gatesBase, raioKm: 50, origemLat: -15.79, origemLng: -47.88 }
    expect(passaNosPortoes(emBrasilia, tenderBase)).toBe(true)

    const longe = { ...tenderBase, municipioLat: -23.55, municipioLng: -46.63 }
    expect(passaNosPortoes(emBrasilia, longe)).toBe(false)
  })

  it('reprova quando o raio está configurado mas faltam coordenadas', () => {
    const comRaio = { ...gatesBase, raioKm: 50, origemLat: -15.79, origemLng: -47.88 }
    expect(passaNosPortoes(comRaio, { ...tenderBase, municipioLat: null })).toBe(false)
  })
})

describe('scoreDoMatch', () => {
  it('reserva o score máximo para casamento de código de catálogo', () => {
    expect(scoreDoMatch(true)).toBe(CODE_MATCH_SCORE)
    expect(scoreDoMatch(false)).toBe(KEYWORD_MATCH_SCORE)
    expect(CODE_MATCH_SCORE).toBeGreaterThan(KEYWORD_MATCH_SCORE)
  })
})
