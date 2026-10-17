import { describe, expect, it } from 'vitest'
import { dadosDoCertame, dadosDoProponente, type EmpresaParaDocumento } from '../src/lib/documentosDaLicitacao/proponente'
import { lerValorDaCelula, propostaComercial, recalcularProposta } from '../src/lib/documentosDaLicitacao/proposta'
import type { Bloco, DocumentoDaLicitacao } from '../src/lib/documentosDaLicitacao/modelo'

const empresa: EmpresaParaDocumento = {
  name: 'Empresa Teste LTDA',
  tipo: 'PESSOA_JURIDICA',
  cnpj: '04003376000100',
  cpf: null,
  email: 'contato@teste.com.br',
  telefone: '(61) 99999-0000',
  responsavel: 'João da Silva',
  responsavelCpf: '52998224725',
  responsavelCargo: 'Sócio-administrador',
  dadosBancarios: null,
  endereco: 'QNA 10',
  enderecoNumero: '12',
  enderecoComplemento: null,
  enderecoBairro: 'Centro',
  enderecoCidade: 'Brasília',
  enderecoUf: 'DF',
  cep: '72110100',
}
const certame = dadosDoCertame({ orgao: 'Órgão X', numeroControle: '1-1-000001/2026', modalidade: 'PREGAO_ELETRONICO', objeto: 'Aquisição de canetas', sessao: null })
const quando = new Date('2026-10-14T15:00:00Z')
const proponente = dadosDoProponente(empresa)
const opcoes = { validadeDias: 45, prazoDeEntrega: '', condicoesDePagamento: '' }

const tabelaDe = (doc: DocumentoDaLicitacao) => doc.blocos.find((b): b is Extract<Bloco, { tipo: 'tabela' }> => b.tipo === 'tabela')!
const textoDe = (doc: DocumentoDaLicitacao) => JSON.stringify(doc)

describe('proposta: valor unitário com 2 casas', () => {
  it('0,125 x 1000 sai com unitário 0,13 e total 130,00 (antes: 0,13 e 125,00)', () => {
    const r = propostaComercial(proponente, certame, [{ numero: 1, descricao: 'Caneta', unidade: 'UN', quantidade: 1000, precoUnitario: 0.125 }], opcoes, quando)
    const linha = tabelaDe(r.documento).linhas[0]
    expect(linha[4]).toBe('0,13')
    expect(linha[5]).toBe('130,00')
    expect(r.total).toBe(130)
    expect(textoDe(r.documento)).toContain('R$ 130,00 (cento e trinta reais)')
  })

  it('validade por extenso de verdade: 45 (quarenta e cinco) dias', () => {
    const r = propostaComercial(proponente, certame, [{ numero: 1, descricao: 'Caneta', unidade: 'UN', quantidade: 1, precoUnitario: 1 }], opcoes, quando)
    expect(textoDe(r.documento)).toContain('Validade da proposta: 45 (quarenta e cinco) dias')
  })
})

describe('recalcularProposta (prévia editada)', () => {
  const gerada = propostaComercial(
    proponente,
    certame,
    [
      { numero: 1, descricao: 'Caneta', unidade: 'UN', quantidade: 1000, precoUnitario: 1.5 },
      { numero: 2, descricao: 'Lápis', unidade: 'UN', quantidade: 10, precoUnitario: 2 },
    ],
    opcoes,
    quando
  ).documento

  const editar = (linha: number, coluna: number, valor: string): DocumentoDaLicitacao => ({
    ...gerada,
    blocos: gerada.blocos.map((b) => (b.tipo === 'tabela' ? { ...b, linhas: b.linhas.map((l, i) => (i === linha ? l.map((c, j) => (j === coluna ? valor : c)) : l)) } : b)),
  })

  it('mudou o preço: total do item, VALOR GLOBAL e valor por extenso fecham', () => {
    const { documento, total } = recalcularProposta(editar(0, 4, '1,10'), { normalizarUnitarios: false })
    const tabela = tabelaDe(documento)
    expect(tabela.linhas[0][5]).toBe('1.100,00')
    expect(tabela.rodape?.[5]).toBe('1.120,00')
    expect(total).toBe(1120)
    expect(textoDe(documento)).toContain('Valor global da proposta: R$ 1.120,00 (mil cento e vinte reais).')
  })

  it('unitário com 3 casas é arredondado antes de multiplicar; no arquivo o unitário sai com 2 casas', () => {
    const editado = editar(0, 4, '0,125')
    expect(tabelaDe(recalcularProposta(editado, { normalizarUnitarios: false }).documento).linhas[0][5]).toBe('130,00')
    const arquivo = tabelaDe(recalcularProposta(editado, { normalizarUnitarios: true }).documento)
    expect(arquivo.linhas[0][4]).toBe('0,13')
  })

  it('preço apagado ou inválido vira marcador no total e sai da soma', () => {
    const { documento, total } = recalcularProposta(editar(1, 4, ''), { normalizarUnitarios: false })
    expect(tabelaDe(documento).linhas[1][5]).toBe('[preencher: total]')
    expect(total).toBe(1500)
  })

  it('documento que não é proposta fica como está', () => {
    const declaracao: DocumentoDaLicitacao = { tipo: 'declaracoes', titulo: 'Declarações', blocos: [{ tipo: 'paragrafo', texto: 'x' }] }
    expect(recalcularProposta(declaracao, { normalizarUnitarios: true })).toEqual({ documento: declaracao, total: null })
  })

  it('lê números das células no formato brasileiro', () => {
    expect(lerValorDaCelula('1.234,56')).toBe(1234.56)
    expect(lerValorDaCelula('R$ 0,13')).toBe(0.13)
    expect(lerValorDaCelula('1.000')).toBe(1000)
    expect(lerValorDaCelula('2,5')).toBe(2.5)
    expect(lerValorDaCelula('[preencher: preço]')).toBeNull()
    expect(lerValorDaCelula('')).toBeNull()
  })
})
