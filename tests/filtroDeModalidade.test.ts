import { describe, expect, it } from 'vitest'
import {
  VALOR_DE_VARIAS_MODALIDADES,
  lerModalidadesDaUrl,
  modalidadesDoSeletor,
  parametroDeModalidade,
  rotuloDasModalidades,
  valorDoSeletorDeModalidade,
} from '../web/src/lib/filtroDeModalidade'

describe('filtro de modalidade da lista de licitações', () => {
  it('o link "Ver todas na lista" da Bela com as duas dispensas filtra as duas', () => {
    const lidas = lerModalidadesDaUrl('DISPENSA_COM_DISPUTA,DISPENSA_SEM_DISPUTA')
    expect(lidas).toEqual(['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'])
    expect(parametroDeModalidade(lidas)).toBe('DISPENSA_COM_DISPUTA,DISPENSA_SEM_DISPUTA')
    expect(valorDoSeletorDeModalidade(lidas)).toBe('DISPENSA')
    expect(rotuloDasModalidades(lidas)).toBe('Dispensa (todas)')
  })

  it('uma modalidade só continua funcionando como antes', () => {
    expect(lerModalidadesDaUrl('PREGAO_ELETRONICO')).toEqual(['PREGAO_ELETRONICO'])
    expect(valorDoSeletorDeModalidade(['PREGAO_ELETRONICO'])).toBe('PREGAO_ELETRONICO')
    expect(parametroDeModalidade(['PREGAO_ELETRONICO'])).toBe('PREGAO_ELETRONICO')
  })

  it('ignora valor desconhecido, repetido, caixa e espaços', () => {
    expect(lerModalidadesDaUrl(' dispensa_com_disputa ; INVENTADA,DISPENSA_COM_DISPUTA  concorrencia')).toEqual(['DISPENSA_COM_DISPUTA', 'CONCORRENCIA'])
    expect(lerModalidadesDaUrl('')).toEqual([])
    expect(lerModalidadesDaUrl(null)).toEqual([])
    expect(lerModalidadesDaUrl('<script>')).toEqual([])
    expect(parametroDeModalidade([])).toBeNull()
  })

  it('"Dispensa (todas)" no seletor vira as duas dispensas, também vindo pela URL', () => {
    expect(modalidadesDoSeletor('DISPENSA', [])).toEqual(['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'])
    expect(lerModalidadesDaUrl('DISPENSA')).toEqual(['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA'])
    expect(modalidadesDoSeletor('', ['CONCORRENCIA'])).toEqual([])
    expect(modalidadesDoSeletor('CONCORRENCIA', ['DISPENSA_COM_DISPUTA'])).toEqual(['CONCORRENCIA'])
  })

  it('combinação sem grupo aparece com o nome de cada modalidade e se mantém no seletor', () => {
    const varias = lerModalidadesDaUrl('CONCORRENCIA,PREGAO_ELETRONICO,DISPENSA_SEM_DISPUTA')
    expect(valorDoSeletorDeModalidade(varias)).toBe(VALOR_DE_VARIAS_MODALIDADES)
    expect(rotuloDasModalidades(varias)).toBe('Concorrência, Pregão Eletrônico e Dispensa (sem disputa)')
    expect(modalidadesDoSeletor(VALOR_DE_VARIAS_MODALIDADES, varias)).toEqual(varias)
  })
})
