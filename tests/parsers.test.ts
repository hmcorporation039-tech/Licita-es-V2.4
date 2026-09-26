import { describe, expect, it } from 'vitest'
import { parsePNCPTender } from '../src/services/pncpParser'
import { parseComprasnetDispensa, parseComprasnetTender } from '../src/services/comprasnetParser'
import { COMPRASNET_MODALIDADE_MAP, PNCP_MODALIDADE_MAP } from '../src/types'
import { escapeHtml, safeHttpUrl } from '../src/lib/html'
import { findMunicipioByNomeUf, getMunicipioByIbge, haversineKm, normalize } from '../src/lib/geoService'

describe('PNCP_MODALIDADE_MAP', () => {
  // O mapa anterior estava errado (tratava o código 1 como Pregão Eletrônico,
  // quando é Leilão) e envenenava o matching de todo mundo em silêncio.
  it('mantém os códigos confirmados contra a API real', () => {
    expect(PNCP_MODALIDADE_MAP[6]).toBe('PREGAO_ELETRONICO')
    expect(PNCP_MODALIDADE_MAP[7]).toBe('PREGAO_PRESENCIAL')
    expect(PNCP_MODALIDADE_MAP[8]).toBe('DISPENSA_SEM_DISPUTA')
    expect(PNCP_MODALIDADE_MAP[9]).toBe('INEXIGIBILIDADE')
    expect(PNCP_MODALIDADE_MAP[1]).not.toBe('PREGAO_ELETRONICO')
  })
})

describe('parsePNCPTender', () => {
  const raw = {
    numeroControlePNCP: '00000000000191-1-000001/2026',
    modalidadeId: 6,
    objetoCompra: 'Aquisição de notebook',
    valorTotalEstimado: '120000.50',
    orgaoEntidade: { cnpj: '00000000000191', razaoSocial: 'MUNICIPIO DE BRASILIA' },
    unidadeOrgao: { ufSigla: 'DF', municipioNome: 'Brasília', codigoIbge: 5300108, nomeUnidade: 'SECRETARIA' },
    dataAberturaProposta: '2026-10-01T14:00:00',
    dataEncerramentoProposta: '2026-09-30T18:00:00',
    dataPublicacaoPncp: '2026-09-15T09:00:00',
    anoCompra: 2026,
    sequencialCompra: 1,
  }

  it('normaliza os campos principais', () => {
    const t = parsePNCPTender(raw)
    expect(t.fonte).toBe('PNCP')
    expect(t.fonteId).toBe('00000000000191-1-000001/2026')
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.valorEstimado).toBeCloseTo(120000.5)
    expect(t.uf).toBe('DF')
    expect(t.orgao).toBe('MUNICIPIO DE BRASILIA')
  })

  it('resolve as coordenadas pelo código IBGE', () => {
    const t = parsePNCPTender(raw)
    expect(t.municipioLat).toBeTypeOf('number')
    expect(t.municipioLng).toBeTypeOf('number')
  })

  it('cai para OUTROS quando a modalidade é desconhecida', () => {
    expect(parsePNCPTender({ ...raw, modalidadeId: 999 }).modalidade).toBe('OUTROS')
  })

  it('monta um fonteId de reserva quando falta o número de controle', () => {
    const { numeroControlePNCP, ...semControle } = raw
    expect(parsePNCPTender(semControle).fonteId).toBe('00000000000191-2026-1')
  })

  it('trunca o objeto resumido em 500 caracteres', () => {
    const t = parsePNCPTender({ ...raw, objetoCompra: 'x'.repeat(900) })
    expect(t.objetoResumido!.length).toBe(500)
    expect(t.objetoResumido!.endsWith('...')).toBe(true)
  })

  // Contrato do raw_json enxuto. Esses três campos são a chave composta que
  // as APIs de documentos, de itens e de situação do PNCP exigem na URL —
  // se algum sumir daqui, a análise de edital e a atualização de situação
  // param de funcionar em silêncio.
  it('guarda no rawJson só a chave composta que o PNCP exige', () => {
    const t = parsePNCPTender({ ...raw, camposQueNinguemLe: 'x'.repeat(5000) })

    expect(t.rawJson).toEqual({
      anoCompra: 2026,
      sequencialCompra: 1,
      orgaoEntidade: { cnpj: '00000000000191' },
    })
  })

  it('não carrega o resto do payload para o banco', () => {
    const t = parsePNCPTender({ ...raw, itens: [{ descricao: 'notebook' }], lixo: 'x'.repeat(5000) })

    expect(Object.keys(t.rawJson)).toHaveLength(3)
    expect(JSON.stringify(t.rawJson)).not.toContain('lixo')
  })

  it('sobrevive a payload sem orgaoEntidade', () => {
    const { orgaoEntidade, ...semOrgao } = raw
    expect(parsePNCPTender(semOrgao).rawJson).toMatchObject({ orgaoEntidade: { cnpj: undefined } })
  })
})

describe('parseComprasnetTender', () => {
  const raw = { id_compra: 42, modalidade: '5', objeto: 'Serviço de limpeza', uasg: 153080, valor_estimado_total: 1000 }

  it('desambigua pregão eletrônico e presencial pelo tipo_pregao', () => {
    expect(parseComprasnetTender(raw).modalidade).toBe('PREGAO_ELETRONICO')
    expect(parseComprasnetTender({ ...raw, tipo_pregao: 'presencial' }).modalidade).toBe('PREGAO_PRESENCIAL')
  })

  it('prefixa o fonteId para não colidir com o PNCP', () => {
    expect(parseComprasnetTender(raw).fonteId).toBe('CNET-LEGADO-42')
  })

  it('guarda a UASG como unidade, em texto', () => {
    expect(parseComprasnetTender(raw).unidade).toBe('153080')
  })

  // Os três consumidores de rawJson só atendem licitação do PNCP, então
  // guardar o registro bruto do ComprasNet era peso morto no banco.
  it('não guarda o payload bruto', () => {
    expect(parseComprasnetTender(raw).rawJson).toEqual({})
    expect(parseComprasnetDispensa({ id_compra: 7, co_modalidade_licitacao: '6' }).rawJson).toEqual({})
  })
})

describe('parseComprasnetDispensa', () => {
  it('mapeia dispensa e inexigibilidade pelo código do módulo legado', () => {
    expect(COMPRASNET_MODALIDADE_MAP['6']).toBe('DISPENSA_SEM_DISPUTA')
    expect(COMPRASNET_MODALIDADE_MAP['7']).toBe('INEXIGIBILIDADE')
  })

  it('usa a primeira data disponível, já que a fonte nem sempre preenche todas', () => {
    const semPublicacao = parseComprasnetDispensa({
      id_compra: 7,
      co_modalidade_licitacao: '6',
      ds_objeto_licitacao: 'Compra direta',
      dt_ratificacao: '2026-09-10',
    })
    expect(semPublicacao.publicadoAt?.toISOString().slice(0, 10)).toBe('2026-09-10')
  })
})

describe('geoService', () => {
  it('normaliza removendo acento e caixa', () => {
    expect(normalize('Uberlândia')).toBe('uberlandia')
    expect(normalize('  SÃO PAULO  ')).toBe('sao paulo')
  })

  it('acha município por nome e UF', () => {
    expect(findMunicipioByNomeUf('Brasília', 'DF')?.uf).toBe('DF')
    expect(findMunicipioByNomeUf('Cidade Que Nao Existe', 'DF')).toBeUndefined()
  })

  it('acha município por código IBGE', () => {
    expect(getMunicipioByIbge('5300108')?.uf).toBe('DF')
  })

  it('calcula distância conhecida com folga de 2%', () => {
    const brasiliaSaoPaulo = haversineKm(-15.7939, -47.8828, -23.5505, -46.6333)
    expect(brasiliaSaoPaulo).toBeGreaterThan(850)
    expect(brasiliaSaoPaulo).toBeLessThan(890)
  })

  it('distância de um ponto a ele mesmo é zero', () => {
    expect(haversineKm(-15.79, -47.88, -15.79, -47.88)).toBeCloseTo(0)
  })
})

describe('escapeHtml', () => {
  it('neutraliza HTML vindo de texto do usuário', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('Notebook "i5" & cia')).toBe('Notebook &quot;i5&quot; &amp; cia')
  })

  it('trata null e undefined como vazio', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('safeHttpUrl', () => {
  it('aceita http e https', () => {
    expect(safeHttpUrl('https://pncp.gov.br/x')).toBe('https://pncp.gov.br/x')
  })

  it('recusa esquema perigoso e valor inválido', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('nao e url')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})
