import { describe, expect, it } from 'vitest'
import { codigoDeRastreioValido, codigosDosErros, cortar, proximoStatusAoResponder, rotaSemConsulta } from '../src/lib/suporte'

describe('suporte', () => {
  it('aceita só código de rastreio no formato esperado', () => {
    expect(codigoDeRastreioValido('3f2a9c1e-1111-4444-8888-abcdefabcdef')).toBe(true)
    expect(codigoDeRastreioValido('curto')).toBe(false)
    expect(codigoDeRastreioValido('tem espaço aqui')).toBe(false)
    expect(codigoDeRastreioValido(undefined)).toBe(false)
  })

  it('tira a consulta da rota para não guardar termos de busca', () => {
    expect(rotaSemConsulta('/api/tenders?q=cimento&uf=GO')).toBe('/api/tenders')
    expect(rotaSemConsulta('/painel#mapa')).toBe('/painel')
  })

  it('corta texto longo e transforma vazio em nulo', () => {
    expect(cortar('  ', 10)).toBeNull()
    expect(cortar('abcdefghijkl', 5)).toBe('abcd…')
  })

  it('pega os códigos dos erros do contexto sem repetir e sem lixo', () => {
    const contexto = { errosRecentes: [{ codigo: 'aaaaaaaa-1' }, { codigo: 'aaaaaaaa-1' }, { codigo: 'x' }, {}] }
    expect(codigosDosErros(contexto)).toEqual(['aaaaaaaa-1'])
    expect(codigosDosErros(null)).toEqual([])
  })

  it('resposta do suporte deixa aguardando o cliente; resposta do cliente reabre', () => {
    expect(proximoStatusAoResponder('SUPORTE', 'ABERTO')).toBe('AGUARDANDO_CLIENTE')
    expect(proximoStatusAoResponder('SUPORTE', 'RESOLVIDO')).toBe('RESOLVIDO')
    expect(proximoStatusAoResponder('CLIENTE', 'RESOLVIDO')).toBe('ABERTO')
  })
})
