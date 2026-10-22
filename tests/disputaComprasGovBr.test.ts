import { describe, expect, it } from 'vitest'
import { aceitaLance, classificarFase, modoPorNome, MODOS_DE_DISPUTA } from '../src/lib/bela/disputaComprasGovBr'

describe('classificarFase', () => {
  it('reconhece item em disputa', () => {
    expect(classificarFase('Em disputa')).toBe('em_disputa')
  })

  it('distingue prorrogação de etapa aberta', () => {
    expect(classificarFase('Etapa aberta prorrogação')).toBe('prorrogacao')
    expect(classificarFase('Etapa aberta')).toBe('em_disputa')
  })

  it('reconhece encerrado, deserto e fracassado', () => {
    expect(classificarFase('Encerrado')).toBe('encerrado')
    expect(classificarFase('Item deserto')).toBe('deserto')
    expect(classificarFase('Fracassado')).toBe('fracassado')
  })

  it('ignora acento e caixa', () => {
    expect(classificarFase('AGUARDANDO DISPUTA')).toBe('aguardando')
    expect(classificarFase('aguardando decisao sobre reinicio')).toBe('aguardando_reinicio')
  })

  it('devolve desconhecido quando não bate', () => {
    expect(classificarFase('status novo qualquer')).toBe('desconhecido')
    expect(classificarFase('')).toBe('desconhecido')
  })
})

describe('aceitaLance', () => {
  it('aceita lance em disputa e na prorrogação', () => {
    expect(aceitaLance('em_disputa')).toBe(true)
    expect(aceitaLance('prorrogacao')).toBe(true)
  })

  it('não aceita lance fora da etapa aberta', () => {
    expect(aceitaLance('aguardando')).toBe(false)
    expect(aceitaLance('encerrado')).toBe(false)
    expect(aceitaLance('aguardando_reinicio')).toBe(false)
  })
})

describe('modoPorNome', () => {
  it('mapeia os nomes dos modos', () => {
    expect(modoPorNome('Aberto')).toBe('ABERTO')
    expect(modoPorNome('Aberto e fechado')).toBe('ABERTO_FECHADO')
    expect(modoPorNome('Fechado e aberto')).toBe('FECHADO_ABERTO')
  })

  it('devolve null quando não reconhece', () => {
    expect(modoPorNome('leilão')).toBeNull()
  })
})

describe('MODOS_DE_DISPUTA', () => {
  it('guarda a regra dos 10 minutos + prorrogação de 2 no modo aberto', () => {
    expect(MODOS_DE_DISPUTA.ABERTO.duracaoInicialMin).toBe(10)
    expect(MODOS_DE_DISPUTA.ABERTO.prorrogacaoMin).toBe(2)
    expect(MODOS_DE_DISPUTA.ABERTO_FECHADO.temIminencia).toBe(true)
  })
})
