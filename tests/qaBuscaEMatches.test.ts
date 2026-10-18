import { describe, expect, it } from 'vitest'
import { normalize } from '../src/lib/geoService'
import {
  buildKeywordRegex,
  matchedKeywords,
  compileKeywordPatterns,
  orgaoMatches,
  passaNosPortoes,
  regexDaPalavraNoPostgres,
  termosDoPreFiltro,
  variacoesDaPalavra,
  variantesDoOrgao,
  type Gates,
  type TenderGateInput,
} from '../src/lib/matching'
import { lerPrazoEmDias } from '../src/lib/estudoDeCustos'
import { fatiasDaPagina } from '../src/lib/paginacaoEmGrupos'
import { whereDaLicitacaoNoFeed } from '../src/lib/feedDeMatches'
import { MODELOS_DE_ITEM } from '../web/src/lib/modelosDeItem'

const casa = (palavra: string, texto: string) => buildKeywordRegex(palavra)!.test(normalize(texto))

describe('palavras curtas: plural certo e nada de virar outra palavra', () => {
  it('gás acha gases e mês acha meses', () => {
    expect(casa('gás', 'Fornecimento de gases medicinais')).toBe(true)
    expect(casa('gases', 'Recarga de gás liquefeito')).toBe(true)
    expect(casa('mês', 'Locação por 12 meses')).toBe(true)
    expect(casa('meses', 'Valor por mês')).toBe(true)
  })

  it('cal não vira cais, e mais, leis e pais não viram mal, lel e pal', () => {
    expect(casa('cal', 'Reforma do cais do porto')).toBe(false)
    expect(casa('cal', 'Aquisição de cal hidratada')).toBe(true)
    expect(variacoesDaPalavra('mais')).not.toContain('mal')
    expect(variacoesDaPalavra('leis')).not.toContain('lel')
    expect(variacoesDaPalavra('leis')).toContain('lei')
    expect(variacoesDaPalavra('pais')).not.toContain('pal')
    expect(variacoesDaPalavra('mil')).not.toContain('mis')
  })

  it('mantém o plural em -l de palavras longas', () => {
    expect(casa('papel', 'Resmas de papéis A4')).toBe(true)
    expect(casa('fuzil', 'Aquisição de fuzis')).toBe(true)
    expect(casa('materiais', 'Material de limpeza')).toBe(true)
  })

  it('o pré-filtro do banco continua cobrindo todas as formas do regex', () => {
    for (const palavra of ['gás', 'mês', 'cal', 'pão', 'papel', 'fuzil', 'leis']) {
      const termos = termosDoPreFiltro(palavra)
      for (const forma of variacoesDaPalavra(normalize(palavra))) expect(termos.some((t) => forma.includes(t))).toBe(true)
    }
  })
})

describe('regex equivalente para o Postgres', () => {
  it('usa a mesma borda ASCII do \\b do JavaScript e as mesmas formas do regex do item', () => {
    expect(regexDaPalavraNoPostgres('aço')).toBe('(?:(?<![A-Za-z0-9_])acos(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])aco(?![A-Za-z0-9_]))')
    expect(regexDaPalavraNoPostgres('nº')).toBe('(?<![A-Za-z0-9_])nº(?=[A-Za-z0-9_])')
    expect(regexDaPalavraNoPostgres('material de limpeza')).toMatch(/^\(\?:\(\?<!\[A-Za-z0-9_\]\)materiais\|.*\]\+de\[.*limpeza\(\?!\[A-Za-z0-9_\]\)\)$/)
    expect(buildKeywordRegex('aço')!.source).toBe('\\b(?:acos|aco)\\b')
    expect(regexDaPalavraNoPostgres('   ')).toBeNull()
  })
})

describe('órgão: prefeitura e município são o mesmo órgão', () => {
  it('gera as formas que o PNCP usa', () => {
    expect(variantesDoOrgao('Prefeitura de Uberlândia')).toContain('municipio de uberlandia')
    expect(variantesDoOrgao('Prefeitura Municipal de Uberlândia')).toContain('municipio de uberlandia')
    expect(variantesDoOrgao('Município de Uberlândia')).toContain('prefeitura municipal de uberlandia')
    expect(variantesDoOrgao('Câmara de Goiânia')).toContain('camara municipal de goiania')
    expect(variantesDoOrgao('Universidade Federal')).toEqual(['universidade federal'])
  })

  it('o portão do item aceita o nome do PNCP', () => {
    expect(orgaoMatches(['Prefeitura de Uberlândia'], 'MUNICIPIO DE UBERLANDIA')).toBe(true)
    expect(orgaoMatches(['Prefeitura'], 'MUNICIPIO DE UBERLANDIA')).toBe(true)
    expect(orgaoMatches(['Câmara Municipal de Uberlândia'], 'CAMARA MUNICIPAL DE UBERLANDIA')).toBe(true)
    expect(orgaoMatches(['Prefeitura de Uberlândia'], 'MUNICIPIO DE ARAGUARI')).toBe(false)
  })
})

describe('raio de distância substitui a lista de UFs', () => {
  const brasilia = { lat: -15.7801, lng: -47.9292 }
  const gates: Gates = { ufs: ['DF'], modalidades: [], orgaos: [], uasgCodes: [], valorMin: null, valorMax: null, raioKm: 300, origemLat: brasilia.lat, origemLng: brasilia.lng }
  const anapolis: TenderGateInput = { fonte: 'PNCP', uf: 'GO', modalidade: 'PREGAO_ELETRONICO', orgao: null, unidade: null, valorEstimado: null, municipioLat: -16.3281, municipioLng: -48.953 }

  it('cidade de GO dentro do raio passa mesmo com DF na lista de UFs', () => {
    expect(passaNosPortoes(gates, anapolis)).toBe(true)
  })

  it('fora do raio continua reprovada, e sem raio a UF volta a valer', () => {
    expect(passaNosPortoes({ ...gates, raioKm: 50 }, anapolis)).toBe(false)
    expect(passaNosPortoes({ ...gates, raioKm: null }, anapolis)).toBe(false)
  })
})

describe('prazo em dias úteis no singular', () => {
  it('1 dia útil é dia útil', () => {
    expect(lerPrazoEmDias('1 dia útil')).toEqual({ dias: 1, uteis: true })
    expect(lerPrazoEmDias('1 (um) dia util')).toEqual({ dias: 1, uteis: true })
    expect(lerPrazoEmDias('5 dias úteis')).toEqual({ dias: 5, uteis: true })
    expect(lerPrazoEmDias('10 dias corridos')).toEqual({ dias: 10, uteis: false })
    expect(lerPrazoEmDias('1 mês')).toEqual({ dias: 30, uteis: false })
  })
})

describe('modelo Aeroportos', () => {
  const aeroportos = MODELOS_DE_ITEM.find((m) => m.id === 'aeroportos')!
  const exclusoes = compileKeywordPatterns(aeroportos.palavrasDeExclusao)
  const excluido = (objeto: string) => matchedKeywords(exclusoes, normalize(objeto), []).length > 0

  it('bairros com nome de aeroporto ficam de fora', () => {
    expect(excluido('Pavimentação de vias no bairro Chácaras Aeroporto')).toBe(true)
    expect(excluido('Drenagem no Parque Aeroporto')).toBe(true)
    expect(excluido('Iluminação do Residencial Aeroporto')).toBe(true)
    expect(excluido('Infraestrutura do Loteamento Aeroporto')).toBe(true)
    expect(excluido('Reforma do terminal de passageiros do aeroporto municipal')).toBe(false)
  })
})

describe('paginação em grupos (obra completa por último)', () => {
  it('pega o fim do primeiro grupo e o começo do segundo na mesma página', () => {
    expect(fatiasDaPagina([25, 10], 2, 20)).toEqual([
      { grupo: 0, skip: 20, take: 5 },
      { grupo: 1, skip: 0, take: 10 },
    ])
    expect(fatiasDaPagina([25, 10], 1, 20)).toEqual([{ grupo: 0, skip: 0, take: 20 }])
    expect(fatiasDaPagina([3, 4], 3, 5)).toEqual([])
    expect(fatiasDaPagina([0, 4], 1, 20)).toEqual([{ grupo: 1, skip: 0, take: 4 }])
  })
})

describe('recorte único do feed de matches', () => {
  it('por padrão exige publicação e a janela de prazo; com as opções, só a regra de aberta', () => {
    const agora = new Date('2026-10-17T12:00:00Z')
    const padrao = whereDaLicitacaoNoFeed({}, agora) as { AND: unknown[] }
    expect(padrao.AND).toHaveLength(4)
    expect(JSON.stringify(padrao)).toContain('"publicadoAt":{"not":null}')
    const tudo = whereDaLicitacaoNoFeed({ incluirInativas: true, incluirForaDoPrazo: true }, agora) as { AND: unknown[] }
    expect(tudo.AND).toHaveLength(1)
  })
})
