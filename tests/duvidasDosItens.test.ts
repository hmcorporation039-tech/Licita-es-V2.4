import { describe, expect, it } from 'vitest'
import { duvidaDoItem, duvidasDosItens, MAX_DUVIDAS_SUGERIDAS } from '../src/lib/duvidasDosItens'

// Itens reais do PE 025/2026 da Assembleia Legislativa do ES (material elétrico).
const ALES = [
  { numero: 1, descricao: 'Chave Aferição características adicionais: dispositivo de segurança na abertura do secundário, componentes: 10 polos', unidade: 'Unidade', valorUnitario: 713.25 },
  { numero: 2, descricao: 'Caixa Eletroduto material: pvc, tamanho: 40 x 20 x 2000, aplicação: cabeamento de dados e rede elétrica', unidade: 'Unidade', valorUnitario: 258.23 },
  { numero: 3, descricao: 'Eletroduto acessórios: 2 tampas de vedação, fita de advertência, fio guia, aplicação: cabo subterrâneo, comprimento: 100, cor: cinza, diâmetro externo: 90', unidade: 'Unidade', valorUnitario: 12.99 },
  { numero: 4, descricao: 'Cabo Elétrico Flexível aplicação: manutenção elétrica, cor da cobertura: preta, tensão isolamento: 750, seção nominal: 6', unidade: 'Unidade', valorUnitario: 93.04 },
  { numero: 6, descricao: 'Terminal Cabo material: alumínio extrudado, tipo: olhal, fixação: compressão, seção nominal condutor: 35', unidade: 'Unidade', valorUnitario: 7.67 },
  { numero: 11, descricao: 'Fita Isolante Elétrica Adesiva tipo adesivo: auto fusão, comprimento nominal: 20, cor: preta', unidade: 'Unidade', valorUnitario: 31.73 },
  { numero: 12, descricao: 'Disjuntor Baixa Tensão funcionamento: termomagnético, corrente nominal: 20', unidade: 'Unidade', valorUnitario: 31.56 },
]

describe('duvidasDosItens', () => {
  it('acha só os itens a metro cadastrados como "Unidade" (caso da Assembleia do ES)', () => {
    const d = duvidasDosItens(ALES)
    expect(d.map((x) => x.numero)).toEqual([3, 4])
    expect(d[0].pergunta).toContain('Item 3 (Eletroduto)')
    expect(d[0].pergunta).toContain('comprimento de 100')
    expect(d[0].pergunta).toMatch(/R\$\s12,99/)
    expect(d[1].pergunta).toContain('Item 4 (Cabo Elétrico Flexível)')
    expect(d[1].pergunta).toMatch(/metro ou a 1 \(um\) rolo/)
  })

  it('não pergunta quando a unidade já diz a medida', () => {
    expect(duvidaDoItem({ numero: 1, descricao: 'Cabo flexível 2,5 mm²', unidade: 'Metro', valorUnitario: 3 })).toBeNull()
    expect(duvidaDoItem({ numero: 1, descricao: 'Cabo flexível 2,5 mm²', unidade: 'Rolo 100 m', valorUnitario: 300 })).toBeNull()
  })

  it('peça curta em mm não gera dúvida', () => {
    expect(duvidaDoItem({ numero: 1, descricao: 'Eletroduto rígido comprimento: 1500 mm', unidade: 'UN', valorUnitario: 20 })).toBeNull()
    expect(duvidaDoItem({ numero: 1, descricao: 'Eletroduto rígido comprimento: 3000 mm', unidade: 'UN', valorUnitario: 20 })).not.toBeNull()
  })

  it('sem valor estimado, a pergunta não fala de valor', () => {
    const d = duvidaDoItem({ numero: null, descricao: 'Fio sólido 1,5 mm²', unidade: null, valorUnitario: null })
    expect(d?.pergunta).toMatch(/^Item \(Fio sólido 1,5 mm²\)/)
    expect(d?.pergunta).not.toContain('R$')
  })

  it('limita a quantidade de perguntas', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ numero: i + 1, descricao: 'Cabo PP 3x2,5', unidade: 'UN', valorUnitario: 10 }))
    expect(duvidasDosItens(muitos)).toHaveLength(MAX_DUVIDAS_SUGERIDAS)
  })
})
