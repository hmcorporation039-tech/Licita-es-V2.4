import { describe, expect, it } from 'vitest'
import { misturarPorFonte } from '../src/lib/misturaDeFontes'

interface Linha {
  id: number
  fonte: string
}

const ehPncp = (l: Linha) => l.fonte === 'PNCP'

function criar(fonte: string, quantidade: number, inicio = 0): Linha[] {
  return Array.from({ length: quantidade }, (_, i) => ({ id: inicio + i, fonte }))
}

describe('misturarPorFonte', () => {
  it('traz uma fonte não-majoritária a cada 5 posições (1-indexado: 5, 10, 15)', () => {
    const itens = [...criar('PNCP', 20), ...criar('TCE_PI', 3, 100)]
    const saida = misturarPorFonte(itens, ehPncp, 5)
    const posicoesOutras = saida.map((l, i) => (l.fonte !== 'PNCP' ? i : -1)).filter((i) => i >= 0)
    expect(posicoesOutras).toEqual([4, 9, 14])
  })

  it('coloca as não-PNCP disponíveis já na primeira página de 20', () => {
    const itens = [...criar('PNCP', 40), ...criar('SISTEMA_S', 3, 100)]
    const primeiraPagina = misturarPorFonte(itens, ehPncp, 5).slice(0, 20)
    expect(primeiraPagina.filter((l) => l.fonte !== 'PNCP')).toHaveLength(3)
  })

  it('preserva a ordem interna de cada fonte', () => {
    const itens = [...criar('PNCP', 10), ...criar('FAMEM', 2, 100)]
    const saida = misturarPorFonte(itens, ehPncp, 5)
    expect(saida.filter((l) => l.fonte === 'PNCP').map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(saida.filter((l) => l.fonte === 'FAMEM').map((l) => l.id)).toEqual([100, 101])
  })

  it('não perde nenhum item', () => {
    const itens = [...criar('PNCP', 7), ...criar('TCE_CE', 4, 100)]
    const saida = misturarPorFonte(itens, ehPncp, 5)
    expect(saida).toHaveLength(11)
    expect(new Set(saida.map((l) => l.id)).size).toBe(11)
  })

  it('devolve igual quando só tem PNCP', () => {
    const itens = criar('PNCP', 8)
    expect(misturarPorFonte(itens, ehPncp, 5)).toEqual(itens)
  })

  it('devolve igual quando não tem PNCP', () => {
    const itens = criar('TCE_TO', 6, 100)
    expect(misturarPorFonte(itens, ehPncp, 5)).toEqual(itens)
  })

  it('quando há mais não-PNCP que o cadência permite, o excedente vai para o fim', () => {
    const itens = [...criar('PNCP', 4), ...criar('INFRAERO', 6, 100)]
    const saida = misturarPorFonte(itens, ehPncp, 5)
    expect(saida.map((l) => l.fonte)).toEqual(['PNCP', 'PNCP', 'PNCP', 'PNCP', 'INFRAERO', 'INFRAERO', 'INFRAERO', 'INFRAERO', 'INFRAERO', 'INFRAERO'])
  })

  it('lista vazia devolve vazia', () => {
    expect(misturarPorFonte([] as Linha[], ehPncp, 5)).toEqual([])
  })
})
