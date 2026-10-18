import { describe, expect, it } from 'vitest'
import { camposAlterados, dadosAtuaisDoItem, mensagemDaBusca, situacaoDaResposta } from '../web/src/lib/buscaDoItem'
import type { MonitoredItem } from '../web/src/lib/types'

const item: MonitoredItem = {
  id: 'i1', userId: 'u1', name: 'Limpeza', keywords: ['material de limpeza'], palavrasDeExclusao: [], catmatCodes: [], catserCodes: [], ufs: ['GO'],
  valorMin: '1000.5', valorMax: null, modalidades: [], orgaos: [], uasgCodes: [], active: true, raioKm: null, origemMunicipio: null, origemUf: null, createdAt: '2026-10-18',
}

describe('mensagem da busca na lista de itens', () => {
  it('mostra encontradas e removidas juntas, com plural certo', () => {
    expect(mensagemDaBusca({ estado: 'concluida', encontrados: 1234, removidos: 1, limitado: false, aviso: null })).toBe('1.234 licitações encontradas · 1 removida. Veja em "Meus matches".')
    expect(mensagemDaBusca({ estado: 'concluida', encontrados: 1, removidos: 0, limitado: false, aviso: null })).toBe('1 licitação encontrada. Veja em "Meus matches".')
    expect(mensagemDaBusca({ estado: 'concluida', encontrados: 0, removidos: 7, limitado: false, aviso: null })).toBe('7 removidas.')
    expect(mensagemDaBusca({ estado: 'concluida', encontrados: 0, removidos: null, limitado: false, aviso: null })).toBe('Nenhuma licitação nova encontrada por enquanto.')
  })

  it('o aviso do limite fica na linha fixa do item, não se repete na mensagem; diz que está buscando e avisa quando falhou', () => {
    expect(mensagemDaBusca({ estado: 'concluida', encontrados: 2000, removidos: null, limitado: true, aviso: 'Palavra muito genérica.' })).toBe('2.000 licitações encontradas. Veja em "Meus matches".')
    expect(mensagemDaBusca({ estado: 'em-andamento', encontrados: null, removidos: null, limitado: false, aviso: null })).toBe('Buscando licitações…')
    expect(mensagemDaBusca({ estado: 'falhou', encontrados: null, removidos: null, limitado: false, aviso: null })).toMatch(/não terminou/)
  })

  it('lê a resposta da API na hora (sem fila) com os totais de cada rota', () => {
    expect(situacaoDaResposta({ busca: 'concluida', matchesEncontrados: 3, matchesRemovidos: 2, limitado: false, aviso: null })).toMatchObject({ estado: 'concluida', encontrados: 3, removidos: 2 })
    expect(situacaoDaResposta({ busca: 'concluida', matchesFound: 5 })).toMatchObject({ encontrados: 5, removidos: null, limitado: false })
    expect(situacaoDaResposta({ busca: 'em-andamento' }).estado).toBe('em-andamento')
  })
})

describe('edição manda só o que mudou', () => {
  it('renomear não manda nenhum campo de regra', () => {
    expect(camposAlterados(dadosAtuaisDoItem(item), { ...dadosAtuaisDoItem(item), name: 'Limpeza GO' })).toEqual({ name: 'Limpeza GO' })
  })

  it('formulário salvo sem mudança não manda nada, inclusive valor que veio como texto da API', () => {
    expect(camposAlterados(dadosAtuaisDoItem(item), { ...dadosAtuaisDoItem(item), valorMin: 1000.5 })).toEqual({})
  })

  it('mudança de regra vai junto, inclusive limpar um campo', () => {
    expect(camposAlterados(dadosAtuaisDoItem(item), { ...dadosAtuaisDoItem(item), palavrasDeExclusao: ['gamer'], valorMin: null })).toEqual({ palavrasDeExclusao: ['gamer'], valorMin: null })
  })
})
