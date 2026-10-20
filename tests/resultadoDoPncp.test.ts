import { describe, expect, it } from 'vitest'
import {
  ResultadoDoItemPncp,
  avaliarFinalizacao,
  escolherVencedor,
  itemCancelado,
  itemEmAndamento,
  repararMojibake,
  resultadoCancelado,
  situacaoDoItem,
} from '../src/lib/resultadoDoPncp'

const RESULTADO_REAL: ResultadoDoItemPncp = {
  niFornecedor: '52112156000168',
  tipoPessoa: 'PJ',
  nomeRazaoSocialFornecedor: 'MERCEARIA SO MERENDAS LTDA',
  numeroItem: 1,
  valorTotalHomologado: 1194.0,
  quantidadeHomologada: 600.0,
  valorUnitarioHomologado: 1.99,
  ordemClassificacaoSrp: 1,
  dataResultado: '2026-10-16',
  dataCancelamento: '0001-01-01T00:00:00',
  porteFornecedorNome: 'ME',
  situacaoCompraItemResultadoId: 1,
  situacaoCompraItemResultadoNome: 'Informado',
  sequencialResultado: 1,
}

describe('reparo de texto com acento estragado (UTF-8 lido como latin1)', () => {
  it('repara "nÃ£o" e "JurÃ\\xaddica"', () => {
    expect(repararMojibake('nÃ£o')).toBe('não')
    expect(repararMojibake('Natureza JurÃ\xaddica nÃ£o informada')).toBe('Natureza Jurídica não informada')
    expect(repararMojibake('PAPELARIA SÃƒO JOSÃ‰')).toBe('PAPELARIA SÃO JOSÉ')
  })

  it('não estraga texto correto', () => {
    for (const correto of ['não', 'São Paulo', 'CAPITÃO', 'MAÇÃ VERDE LTDA', 'Homologado', 'Ação № 1', 'Ãgua', 'ÃO']) {
      expect(repararMojibake(correto)).toBe(correto)
    }
  })

  it('texto misto, com acento certo e o padrão estragado, fica como veio', () => {
    expect(repararMojibake('ação nÃ£o')).toBe('ação nÃ£o')
  })

  it('nulo e vazio', () => {
    expect(repararMojibake(null)).toBeNull()
    expect(repararMojibake(undefined)).toBeNull()
    expect(repararMojibake('')).toBe('')
  })
})

describe('escolha do vencedor do item', () => {
  it('resultado real do PNCP: um fornecedor, campos normalizados', () => {
    expect(escolherVencedor([RESULTADO_REAL])).toEqual({
      ni: '52112156000168',
      nome: 'MERCEARIA SO MERENDAS LTDA',
      porte: 'ME',
      valorUnitarioHomologado: 1.99,
      quantidadeHomologada: 600,
      valorTotalHomologado: 1194,
      dataDoResultado: new Date('2026-10-16T00:00:00.000Z'),
      fornecedoresRegistrados: 1,
    })
  })

  it('registro de preços com vários: vence a menor ordem de classificação, e conta os ativos', () => {
    const vencedor = escolherVencedor([
      { ...RESULTADO_REAL, niFornecedor: '11111111000111', nomeRazaoSocialFornecedor: 'TERCEIRA', ordemClassificacaoSrp: 3, sequencialResultado: 1 },
      { ...RESULTADO_REAL, niFornecedor: '22222222000122', nomeRazaoSocialFornecedor: 'SEGUNDA', ordemClassificacaoSrp: 2, sequencialResultado: 2 },
      { ...RESULTADO_REAL, niFornecedor: '33333333000133', nomeRazaoSocialFornecedor: 'PRIMEIRA', ordemClassificacaoSrp: 1, sequencialResultado: 3, valorUnitarioHomologado: 1.5 },
    ])
    expect(vencedor?.nome).toBe('PRIMEIRA')
    expect(vencedor?.valorUnitarioHomologado).toBe(1.5)
    expect(vencedor?.fornecedoresRegistrados).toBe(3)
  })

  it('empate na classificação: decide pelo sequencial do resultado', () => {
    const vencedor = escolherVencedor([
      { ...RESULTADO_REAL, niFornecedor: '1', nomeRazaoSocialFornecedor: 'DEPOIS', ordemClassificacaoSrp: null, sequencialResultado: 2 },
      { ...RESULTADO_REAL, niFornecedor: '2', nomeRazaoSocialFornecedor: 'ANTES', ordemClassificacaoSrp: null, sequencialResultado: 1 },
    ])
    expect(vencedor?.nome).toBe('ANTES')
  })

  it('resultado cancelado é ignorado, por data de cancelamento ou por situação', () => {
    const cancelado = { ...RESULTADO_REAL, niFornecedor: '99999999000199', nomeRazaoSocialFornecedor: 'CANCELADA', ordemClassificacaoSrp: 1, dataCancelamento: '2026-10-18T10:00:00' }
    const situacaoCancelada = { ...RESULTADO_REAL, niFornecedor: '88888888000188', nomeRazaoSocialFornecedor: 'SITUAÇÃO CANCELADA', ordemClassificacaoSrp: 1, situacaoCompraItemResultadoId: 2, situacaoCompraItemResultadoNome: 'Cancelado' }
    const valido = { ...RESULTADO_REAL, ordemClassificacaoSrp: 2, nomeRazaoSocialFornecedor: 'VÁLIDA' }
    expect(resultadoCancelado(cancelado)).toBe(true)
    expect(resultadoCancelado(situacaoCancelada)).toBe(true)
    expect(resultadoCancelado(RESULTADO_REAL)).toBe(false)
    const vencedor = escolherVencedor([cancelado, situacaoCancelada, valido])
    expect(vencedor?.nome).toBe('VÁLIDA')
    expect(vencedor?.fornecedoresRegistrados).toBe(1)
  })

  it('só cancelados ou lista vazia: sem vencedor', () => {
    expect(escolherVencedor([])).toBeNull()
    expect(escolherVencedor([{ ...RESULTADO_REAL, dataCancelamento: '2026-10-18' }])).toBeNull()
  })

  it('repara o nome do fornecedor com acento estragado', () => {
    expect(escolherVencedor([{ ...RESULTADO_REAL, nomeRazaoSocialFornecedor: 'COMÃ‰RCIO DE ALIMENTOS SÃƒO JOÃƒO' }])?.nome).toBe('COMÉRCIO DE ALIMENTOS SÃO JOÃO')
  })
})

describe('situação do item', () => {
  it('repara a situação e reconhece andamento e cancelamento', () => {
    expect(situacaoDoItem({ situacaoCompraItemNome: 'Anulado/Revogado/Cancelado' })).toBe('Anulado/Revogado/Cancelado')
    expect(itemEmAndamento('Em andamento', 1)).toBe(true)
    expect(itemEmAndamento('Homologado', 2)).toBe(false)
    expect(itemEmAndamento(null, 4)).toBe(false)
    expect(itemEmAndamento(null, null)).toBe(true)
    expect(itemCancelado('Anulado/Revogado/Cancelado')).toBe(true)
    expect(itemCancelado('Deserto')).toBe(false)
  })
})

describe('finalização do resultado da licitação', () => {
  const homologado = { situacao: 'Homologado', noBanco: true, temVencedor: true, valorTotalHomologado: 1194 }

  it('todos em situação final e homologados com vencedor: final, com a soma', () => {
    expect(
      avaliarFinalizacao([homologado, { ...homologado, valorTotalHomologado: 806.5 }, { situacao: 'Deserto', noBanco: true, temVencedor: false, valorTotalHomologado: null }])
    ).toEqual({ final: true, homologados: 2, somaHomologada: 2000.5 })
  })

  it('item em andamento segura a finalização', () => {
    expect(avaliarFinalizacao([homologado, { situacao: 'Em andamento', noBanco: true, temVencedor: false, valorTotalHomologado: null }]).final).toBe(false)
  })

  it('item homologado ainda sem vencedor gravado segura a finalização', () => {
    expect(avaliarFinalizacao([{ ...homologado, temVencedor: false, valorTotalHomologado: null }]).final).toBe(false)
  })

  it('item homologado que não existe no banco não segura', () => {
    expect(avaliarFinalizacao([homologado, { situacao: 'Homologado', noBanco: false, temVencedor: false, valorTotalHomologado: null }])).toEqual({
      final: true,
      homologados: 2,
      somaHomologada: 1194,
    })
  })

  it('tudo deserto ou fracassado: final, sem homologado', () => {
    expect(
      avaliarFinalizacao([
        { situacao: 'Deserto', noBanco: true, temVencedor: false, valorTotalHomologado: null },
        { situacao: 'Fracassado', noBanco: true, temVencedor: false, valorTotalHomologado: null },
      ])
    ).toEqual({ final: true, homologados: 0, somaHomologada: null })
  })

  it('sem itens no PNCP não finaliza', () => {
    expect(avaliarFinalizacao([]).final).toBe(false)
  })
})
