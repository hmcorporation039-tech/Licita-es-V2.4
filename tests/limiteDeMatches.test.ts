import { describe, expect, it } from 'vitest'
import { MAX_MATCHES_POR_ITEM, avisoDoLimite, compararPorAderenciaEPrazo, selecionarDentroDoLimite, type CandidatoComAderencia } from '../src/lib/limiteDeMatches'

const AGORA = new Date('2026-10-18T12:00:00Z').getTime()
const emDias = (n: number) => new Date(AGORA + n * 86_400_000)
const candidato = (tenderId: string, score: number, encerramentoAt: Date | null): CandidatoComAderencia => ({ tenderId, score, encerramentoAt })

describe('compararPorAderenciaEPrazo', () => {
  it('põe a maior aderência primeiro e, empatada, o prazo mais próximo; sem prazo vai para o fim', () => {
    const lista = [
      candidato('sem-prazo-alta', 0.9, null),
      candidato('baixa-urgente', 0.4, emDias(1)),
      candidato('alta-longe', 0.9, emDias(40)),
      candidato('alta-perto', 0.9, emDias(3)),
      candidato('media', 0.7, emDias(10)),
    ]
    expect([...lista].sort(compararPorAderenciaEPrazo).map((c) => c.tenderId)).toEqual(['alta-perto', 'alta-longe', 'sem-prazo-alta', 'media', 'baixa-urgente'])
  })

  it('desempata pelo id para a ordem ser estável entre execuções', () => {
    const a = candidato('a', 0.5, emDias(5))
    const b = candidato('b', 0.5, emDias(5))
    expect([b, a].sort(compararPorAderenciaEPrazo).map((c) => c.tenderId)).toEqual(['a', 'b'])
    expect(compararPorAderenciaEPrazo(a, { ...a })).toBe(0)
  })
})

describe('selecionarDentroDoLimite', () => {
  const muitos = Array.from({ length: 50 }, (_, i) => candidato(`t${String(i).padStart(2, '0')}`, (i % 10) / 10, emDias(50 - i)))

  it('guarda só os mais aderentes até o limite e avisa que cortou', () => {
    const { selecionados, limitado } = selecionarDentroDoLimite(muitos, 0, 10)
    expect(limitado).toBe(true)
    expect(selecionados).toHaveLength(10)
    expect(selecionados.every((c) => c.score >= 0.8)).toBe(true)
    expect(selecionados[0]).toEqual(muitos[49])
  })

  it('desconta o que o item já tem aberto e não passa do limite', () => {
    const { selecionados, limitado } = selecionarDentroDoLimite(muitos, 45, 50)
    expect(selecionados).toHaveLength(5)
    expect(limitado).toBe(true)
  })

  it('item já no limite não recebe nada novo', () => {
    expect(selecionarDentroDoLimite(muitos, 50, 50)).toEqual({ selecionados: [], limitado: true })
    expect(selecionarDentroDoLimite(muitos, 80, 50).selecionados).toEqual([])
  })

  it('abaixo do limite guarda tudo, ordenado, sem aviso', () => {
    const { selecionados, limitado } = selecionarDentroDoLimite(muitos.slice(0, 5), 0, 10)
    expect(limitado).toBe(false)
    expect(selecionados.map((c) => c.tenderId)).toEqual(['t04', 't03', 't02', 't01', 't00'])
  })

  it('exatamente no limite não é corte', () => {
    expect(selecionarDentroDoLimite(muitos.slice(0, 10), 0, 10).limitado).toBe(false)
    expect(selecionarDentroDoLimite(muitos.slice(0, 10), 1, 10).limitado).toBe(true)
  })

  it('não altera a lista recebida', () => {
    const copia = [...muitos]
    selecionarDentroDoLimite(muitos, 0, 10)
    expect(muitos).toEqual(copia)
  })

  it('o limite padrão cabe num único INSERT (8 colunas por linha, teto de 32.767 parâmetros do Postgres)', () => {
    expect(MAX_MATCHES_POR_ITEM * 8).toBeLessThan(32_767)
    expect(selecionarDentroDoLimite(muitos, 0).limitado).toBe(false)
  })
})

describe('avisoDoLimite', () => {
  it('explica o corte com o número formatado e como refinar', () => {
    expect(avisoDoLimite()).toBe('Palavra muito genérica: mostrando as 2.000 mais aderentes — refine com estados, valor ou palavras de exclusão.')
  })
})
