import { describe, expect, it } from 'vitest'
import { dadosIniciais, type ItemDaLicitacao } from '../src/lib/estudoDeCustos'
import { montarProposta, propostaEmTexto } from '../src/lib/propostaDoEstudo'

const itens: ItemDaLicitacao[] = [
  { id: 'a', numero: 1, descricao: 'Câmera IP 4MP', unidade: 'UN', quantidade: 10, valorEstimadoUnit: 900 },
  { id: 'b', numero: 2, descricao: 'Gravador NVR 16 canais', unidade: 'UN', quantidade: 2, valorEstimadoUnit: 3000 },
  { id: 'c', numero: 3, descricao: 'Instalação', unidade: 'SV', quantidade: 1, valorEstimadoUnit: null },
]

describe('proposta do estudo de custos', () => {
  it('usa o preço de venda de cada item e lista o que ficou sem preço', () => {
    const dados = dadosIniciais()
    dados.itens.a = { custoUnit: 600, precoVendaUnit: 850.555 }
    dados.itens.b = { custoUnit: 2000, precoVendaUnit: 2900 }
    const p = montarProposta(itens, dados)
    expect(p.itens).toEqual([
      { numero: 1, descricao: 'Câmera IP 4MP', unidade: 'UN', quantidade: 10, precoUnitario: 850.56, total: 8505.6, marcaModelo: null, estimadoUnitario: 900 },
      { numero: 2, descricao: 'Gravador NVR 16 canais', unidade: 'UN', quantidade: 2, precoUnitario: 2900, total: 5800, marcaModelo: null, estimadoUnitario: 3000 },
    ])
    expect(p.semPreco).toEqual([{ numero: 3, descricao: 'Instalação' }])
    expect(p.acimaDoEstimado).toEqual([])
    expect(p.total).toBe(14305.6)
    expect(propostaEmTexto(p).split('\n')[1]).toBe('1\tCâmera IP 4MP\tUN\t10\t850,56\t8.505,60')
  })

  it('aponta o item acima do estimado e leva a marca para o texto', () => {
    const dados = dadosIniciais()
    dados.itens.a = { custoUnit: 600, precoVendaUnit: 900.01, marcaModelo: '  Intelbras VIP 3430 ' }
    dados.itens.b = { custoUnit: 2000, precoVendaUnit: 3000 }
    const p = montarProposta(itens, dados)
    expect(p.acimaDoEstimado).toEqual([{ numero: 1, descricao: 'Câmera IP 4MP', precoUnitario: 900.01, estimadoUnitario: 900 }])
    const linhas = propostaEmTexto(p).split('\n')
    expect(linhas[0]).toBe('Item\tDescrição\tMarca/modelo\tUnidade\tQuantidade\tPreço unitário\tTotal')
    expect(linhas[1]).toBe('1\tCâmera IP 4MP\tIntelbras VIP 3430\tUN\t10\t900,01\t9.000,10')
    expect(linhas[2]).toBe('2\tGravador NVR 16 canais\t\tUN\t2\t3.000,00\t6.000,00')
  })
})
