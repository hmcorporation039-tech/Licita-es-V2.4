import { describe, expect, it } from 'vitest'
import { calcularAderencia, faixaDaNota, EntradaDeAderencia } from '../src/lib/aderencia'

const AGORA = new Date('2026-10-05T12:00:00Z')
const emDias = (n: number) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000)

function entrada(extra: Partial<EntradaDeAderencia> = {}): EntradaDeAderencia {
  return {
    porCodigo: false,
    palavrasEncontradas: 1,
    palavrasTotal: 1,
    item: { ufs: [], valorMin: null, valorMax: null, raioKm: null, origemLat: null, origemLng: null },
    tender: { uf: 'DF', valorEstimado: 100_000, encerramentoAt: emDias(20), municipioLat: null, municipioLng: null },
    agora: AGORA,
    ...extra,
  }
}

const pontos = (e: EntradaDeAderencia, id: string) => calcularAderencia(e).criterios.find((c) => c.id === id)!.pontos

describe('calcularAderencia — estrutura', () => {
  it('sempre devolve os 4 critérios, cada um com motivo, e a nota é a soma (0 a 100)', () => {
    const a = calcularAderencia(entrada())
    expect(a.criterios.map((c) => c.id)).toEqual(['objeto', 'prazo', 'valor', 'localizacao'])
    expect(a.criterios.every((c) => c.motivo.length > 10)).toBe(true)
    expect(a.criterios.reduce((s, c) => s + c.maximo, 0)).toBe(100)
    expect(a.nota).toBe(a.criterios.reduce((s, c) => s + c.pontos, 0))
    expect(a.nota).toBeGreaterThanOrEqual(0)
    expect(a.nota).toBeLessThanOrEqual(100)
  })

  it('nenhum critério passa do seu máximo', () => {
    const a = calcularAderencia(
      entrada({
        porCodigo: true,
        item: { ufs: ['DF'], valorMin: 1, valorMax: 1_000_000, raioKm: 100, origemLat: -15.78, origemLng: -47.93 },
        tender: { uf: 'DF', valorEstimado: 100_000, encerramentoAt: emDias(30), municipioLat: -15.78, municipioLng: -47.93 },
      })
    )
    for (const c of a.criterios) expect(c.pontos).toBeLessThanOrEqual(c.maximo)
    expect(a.nota).toBe(100)
    expect(a.faixa).toBe('alta')
  })
})

describe('objeto', () => {
  it('código CATMAT/CATSER é o sinal mais forte (50)', () => {
    expect(pontos(entrada({ porCodigo: true }), 'objeto')).toBe(50)
  })

  it('palavra-chave vale menos, e mais ainda se achou todas', () => {
    expect(pontos(entrada({ palavrasEncontradas: 1, palavrasTotal: 4 }), 'objeto')).toBe(24)
    expect(pontos(entrada({ palavrasEncontradas: 4, palavrasTotal: 4 }), 'objeto')).toBe(35)
    expect(pontos(entrada({ palavrasEncontradas: 4, palavrasTotal: 4 }), 'objeto')).toBeLessThan(50)
  })

  it('não quebra com total zero nem com mais encontradas que o total', () => {
    expect(pontos(entrada({ palavrasEncontradas: 0, palavrasTotal: 0 }), 'objeto')).toBeGreaterThanOrEqual(20)
    expect(pontos(entrada({ palavrasEncontradas: 9, palavrasTotal: 2 }), 'objeto')).toBe(35)
  })
})

describe('prazo', () => {
  const comFim = (n: number | null) => entrada({ tender: { ...entrada().tender, encerramentoAt: n === null ? null : emDias(n) } })

  it('quanto mais tempo para propor, mais pontos', () => {
    expect(pontos(comFim(20), 'prazo')).toBe(20)
    expect(pontos(comFim(10), 'prazo')).toBe(16)
    expect(pontos(comFim(4), 'prazo')).toBe(10)
    expect(pontos(comFim(2), 'prazo')).toBe(5)
    expect(pontos(comFim(0.5), 'prazo')).toBe(2)
  })

  it('já encerrado zera; sem data (dispensa) é neutro', () => {
    expect(pontos(comFim(-1), 'prazo')).toBe(0)
    expect(pontos(comFim(null), 'prazo')).toBe(12)
  })
})

describe('valor', () => {
  const com = (min: number | null, max: number | null, valor: number | null) =>
    entrada({ item: { ...entrada().item, valorMin: min, valorMax: max }, tender: { ...entrada().tender, valorEstimado: valor } })

  it('dentro da faixa definida = máximo; fora = 0', () => {
    expect(pontos(com(50_000, 200_000, 100_000), 'valor')).toBe(15)
    expect(pontos(com(50_000, 200_000, 300_000), 'valor')).toBe(0)
    expect(pontos(com(null, 200_000, 100_000), 'valor')).toBe(15)
  })

  it('sem faixa ou sem valor informado: neutro, nunca máximo', () => {
    expect(pontos(com(null, null, 100_000), 'valor')).toBe(8)
    expect(pontos(com(50_000, null, null), 'valor')).toBe(6)
  })
})

describe('localização', () => {
  // Brasília -> Goiânia ≈ 175 km
  const brasilia = { lat: -15.7939, lng: -47.8828 }
  const goiania = { lat: -16.6869, lng: -49.2648 }

  it('raio: mais perto, mais pontos (8 na borda, 15 no mesmo lugar)', () => {
    const perto = entrada({
      item: { ...entrada().item, raioKm: 300, origemLat: brasilia.lat, origemLng: brasilia.lng },
      tender: { ...entrada().tender, municipioLat: brasilia.lat, municipioLng: brasilia.lng },
    })
    const medio = entrada({
      item: { ...entrada().item, raioKm: 300, origemLat: brasilia.lat, origemLng: brasilia.lng },
      tender: { ...entrada().tender, municipioLat: goiania.lat, municipioLng: goiania.lng },
    })
    expect(pontos(perto, 'localizacao')).toBe(15)
    expect(pontos(medio, 'localizacao')).toBeGreaterThan(8)
    expect(pontos(medio, 'localizacao')).toBeLessThan(15)
    expect(calcularAderencia(medio).criterios[3].motivo).toMatch(/km/)
  })

  it('UF escolhida e batendo = 12; fora da UF = 0', () => {
    expect(pontos(entrada({ item: { ...entrada().item, ufs: ['DF', 'GO'] } }), 'localizacao')).toBe(12)
    expect(pontos(entrada({ item: { ...entrada().item, ufs: ['SP'] } }), 'localizacao')).toBe(0)
  })

  it('busca nacional (nada restrito) é neutra', () => {
    expect(pontos(entrada(), 'localizacao')).toBe(8)
  })
})

describe('faixaDaNota', () => {
  it('limites das faixas', () => {
    expect(faixaDaNota(100)).toBe('alta')
    expect(faixaDaNota(80)).toBe('alta')
    expect(faixaDaNota(79)).toBe('boa')
    expect(faixaDaNota(60)).toBe('boa')
    expect(faixaDaNota(59)).toBe('media')
    expect(faixaDaNota(40)).toBe('media')
    expect(faixaDaNota(39)).toBe('baixa')
    expect(faixaDaNota(0)).toBe('baixa')
  })
})

describe('exemplos realistas', () => {
  it('match por código, no prazo, sem restrições: nota alta; só por palavra: boa, não alta', () => {
    const a = calcularAderencia(entrada({ porCodigo: true }))
    expect(a.nota).toBe(50 + 20 + 8 + 8)
    expect(a.faixa).toBe('alta')
  })

  it('match só por 1 de 4 palavras, prazo curto, fora da faixa de valor: nota baixa', () => {
    const a = calcularAderencia(
      entrada({
        palavrasEncontradas: 1,
        palavrasTotal: 4,
        item: { ...entrada().item, valorMax: 10_000 },
        tender: { ...entrada().tender, encerramentoAt: emDias(2) },
      })
    )
    expect(a.faixa).toBe('baixa')
  })
})

describe('código vale mais que palavra-chave, tudo o mais igual', () => {
  it('mesma licitação: por código > por todas as palavras', () => {
    const porCodigo = calcularAderencia(entrada({ porCodigo: true }))
    const porPalavras = calcularAderencia(entrada({ palavrasEncontradas: 3, palavrasTotal: 3 }))
    expect(porCodigo.nota).toBeGreaterThan(porPalavras.nota)
    expect(porCodigo.faixa).toBe('alta')
    expect(porPalavras.faixa).toBe('boa')
  })
})
