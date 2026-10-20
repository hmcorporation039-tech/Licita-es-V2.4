import { describe, expect, it } from 'vitest'
import {
  MENSAGEM_SEM_RESULTADO,
  diferencaPercentual,
  formatarDocumentoDoFornecedor,
  mostraResultado,
  porteDeMicroOuPequena,
  resumoDoResultado,
  textoDoResumo,
  textoDosItensHomologados,
  textoDosOutrosFornecedores,
  tomDaSituacao,
} from '../web/src/lib/resultadoDaLicitacao'

const ESPACO = /\s/
const ESPACO_DO_DINHEIRO = new RegExp(String.fromCharCode(0xa0), 'g')

describe('resumo do topo da seção Resultado', () => {
  it('N de M homologados, total e percentual abaixo do estimado só com estimado > 0', () => {
    const itens = [
      { situacaoDoResultado: 'Homologado', quantidade: '600', valorUnitario: '2.50', valorTotal: '1500', valorUnitarioHomologado: '1.99', quantidadeHomologada: '600', valorTotalHomologado: '1194' },
      { situacaoDoResultado: 'Homologado', quantidade: '100', valorUnitario: '10', valorTotal: '1000', valorUnitarioHomologado: '8', quantidadeHomologada: '100', valorTotalHomologado: '800' },
      { situacaoDoResultado: 'Homologado', quantidade: '10', valorUnitario: null, valorTotal: null, valorUnitarioHomologado: '5', quantidadeHomologada: '10', valorTotalHomologado: '50' },
      { situacaoDoResultado: 'Deserto', quantidade: '5', valorUnitario: '3', valorTotal: '15' },
    ]
    const resumo = resumoDoResultado(itens)
    expect(resumo).toMatchObject({ itens: 4, homologados: 3, totalHomologado: 2044 })
    expect(resumo.percentualAbaixoDoEstimado).toBeCloseTo((1 - 1994 / 2500) * 100, 6)
    expect(textoDoResumo(resumo).replace(ESPACO_DO_DINHEIRO, ' ')).toBe('3 de 4 itens homologados · total homologado R$ 2.044,00 · 20,2% abaixo do estimado')
  })

  it('compara pelo que foi homologado quando a quantidade registrada difere da estimada', () => {
    const resumo = resumoDoResultado([
      { situacaoDoResultado: 'Homologado', quantidade: '1000', valorUnitario: '2', valorTotal: '2000', valorUnitarioHomologado: '1', quantidadeHomologada: '500', valorTotalHomologado: '500' },
    ])
    expect(resumo.percentualAbaixoDoEstimado).toBeCloseTo(50, 6)
  })

  it('vencedor acima do estimado aparece como acima', () => {
    const resumo = resumoDoResultado([{ situacaoDoResultado: 'Homologado', quantidade: '1', valorUnitario: '100', valorUnitarioHomologado: '110', quantidadeHomologada: '1', valorTotalHomologado: '110' }])
    expect(textoDoResumo(resumo)).toContain('10,0% acima do estimado')
  })

  it('sem estimado: mostra contagem e total, sem percentual', () => {
    const texto = textoDoResumo(resumoDoResultado([{ situacaoDoResultado: 'Homologado', valorTotalHomologado: '50', quantidadeHomologada: '10' }]))
    expect(texto.replace(ESPACO, ' ')).toMatch(/^1 de 1 item homologado · total homologado R\$\s50,00$/)
  })

  it('nada saiu ainda: mensagem de espera', () => {
    expect(textoDoResumo(resumoDoResultado([]))).toBe(MENSAGEM_SEM_RESULTADO)
    expect(textoDoResumo(resumoDoResultado([{ situacaoDoResultado: 'Em andamento' }, { situacaoDoResultado: null }]))).toBe(MENSAGEM_SEM_RESULTADO)
    expect(MENSAGEM_SEM_RESULTADO).toBe('O resultado ainda não saiu no PNCP. A Licita Bela confere algumas vezes por dia.')
  })

  it('tudo deserto: 0 de N, sem a mensagem de espera', () => {
    expect(textoDoResumo(resumoDoResultado([{ situacaoDoResultado: 'Deserto' }, { situacaoDoResultado: 'Fracassado' }]))).toBe('0 de 2 itens homologados')
  })
})

describe('linha da tabela do resultado', () => {
  it('diferença percentual do preço vencedor contra o estimado', () => {
    expect(diferencaPercentual({ valorUnitario: '2.5', valorUnitarioHomologado: '1.99' })).toBeCloseTo(-20.4, 6)
    expect(diferencaPercentual({ valorUnitario: '0', valorUnitarioHomologado: '1.99' })).toBeNull()
    expect(diferencaPercentual({ valorTotal: '1500', quantidade: '600', valorTotalHomologado: '1194', quantidadeHomologada: '600' })).toBeCloseTo(-20.4, 6)
  })

  it('cor do selo por situação', () => {
    expect(tomDaSituacao('Homologado')).toBe('ok')
    expect(tomDaSituacao('Deserto')).toBe('neutral')
    expect(tomDaSituacao('Fracassado')).toBe('warn')
    expect(tomDaSituacao('Anulado/Revogado/Cancelado')).toBe('danger')
    expect(tomDaSituacao('Em andamento')).toBe('accent')
  })

  it('CNPJ formatado, CPF mascarado e porte ME/EPP', () => {
    expect(formatarDocumentoDoFornecedor('52112156000168')).toBe('52.112.156/0001-68')
    expect(formatarDocumentoDoFornecedor('12345678901')).toBe('***.456.789-**')
    expect(formatarDocumentoDoFornecedor(null)).toBeNull()
    expect(porteDeMicroOuPequena('ME')).toBe('ME')
    expect(porteDeMicroOuPequena('EPP')).toBe('EPP')
    expect(porteDeMicroOuPequena('Demais')).toBeNull()
  })

  it('outros fornecedores registrados e a linha das Escolhidas', () => {
    expect(textoDosOutrosFornecedores(1)).toBeNull()
    expect(textoDosOutrosFornecedores(2)).toBe('e mais 1 fornecedor registrado')
    expect(textoDosOutrosFornecedores(4)).toBe('e mais 3 fornecedores registrados')
    expect(textoDosItensHomologados(1)).toBe('Resultado: 1 item homologado')
    expect(textoDosItensHomologados(5)).toBe('Resultado: 5 itens homologados')
  })

  it('seção só para PNCP com prazo já passado', () => {
    const agora = new Date('2026-10-20T12:00:00Z')
    expect(mostraResultado({ fonte: 'PNCP', encerramentoAt: '2026-10-10T12:00:00Z' }, agora)).toBe(true)
    expect(mostraResultado({ fonte: 'PNCP', encerramentoAt: '2026-10-25T12:00:00Z' }, agora)).toBe(false)
    expect(mostraResultado({ fonte: 'PNCP', encerramentoAt: null }, agora)).toBe(false)
    expect(mostraResultado({ fonte: 'SESC_REGIONAL', encerramentoAt: '2026-10-10T12:00:00Z' }, agora)).toBe(false)
  })
})
