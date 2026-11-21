import { describe, expect, it } from 'vitest'
import { deveOferecerAJornada, lerEstadoDaJornada, novoEstadoDaJornada, pedidoDaJornadaSchema } from '../src/lib/jornadaDaBela'
import { falaDoConvite, falaDoResultado, linkDasAbertas, mesmosEstados, nomeDoItem, ondeEmTexto, primeiroNome } from '../web/src/lib/jornadaNaTela'

const agora = new Date('2026-11-21T12:00:00Z')

describe('Bela que acompanha: quando oferecer', () => {
  it('só para quem está no teste', () => {
    expect(deveOferecerAJornada('TESTE', null, agora)).toBe(true)
    expect(deveOferecerAJornada('EMPRESARIAL', null, agora)).toBe(false)
  })

  it('não oferece de novo para quem recusou ou terminou', () => {
    expect(deveOferecerAJornada('TESTE', { fase: 'recusada', atualizadoEm: agora.toISOString() }, agora)).toBe(false)
    expect(deveOferecerAJornada('TESTE', { fase: 'etapa1Feita', atualizadoEm: agora.toISOString() }, agora)).toBe(false)
  })

  it('"agora não" volta no dia seguinte', () => {
    const adiada = novoEstadoDaJornada({ fase: 'adiada' }, null, agora)
    expect(deveOferecerAJornada('TESTE', adiada, new Date('2026-11-21T20:00:00Z'))).toBe(false)
    expect(deveOferecerAJornada('TESTE', adiada, new Date('2026-11-22T12:00:01Z'))).toBe(true)
  })

  it('quem está no meio continua', () => {
    expect(deveOferecerAJornada('TESTE', { fase: 'onde', termo: 'uniformes', atualizadoEm: agora.toISOString() }, agora)).toBe(true)
  })
})

describe('Bela que acompanha: o que grava', () => {
  it('mantém o termo e os estados de antes quando a fase nova não manda', () => {
    const antes = novoEstadoDaJornada({ fase: 'onde', termo: 'uniformes', ufs: ['DF'] }, null, agora)
    const depois = novoEstadoDaJornada({ fase: 'buscando' }, antes, agora)
    expect(depois).toMatchObject({ fase: 'buscando', termo: 'uniformes', ufs: ['DF'] })
  })

  it('recusa fase ou estado desconhecido e lê JSON estranho como "não começou"', () => {
    expect(pedidoDaJornadaSchema.safeParse({ fase: 'hackear' }).success).toBe(false)
    expect(pedidoDaJornadaSchema.safeParse({ fase: 'onde', ufs: ['XX'] }).success).toBe(false)
    expect(lerEstadoDaJornada({ fase: 'nada' })).toBeNull()
    expect(lerEstadoDaJornada('texto')).toBeNull()
    expect(lerEstadoDaJornada(null)).toBeNull()
  })
})

describe('Bela que acompanha: falas', () => {
  it('chama pelo primeiro nome', () => {
    expect(primeiroNome('gilson souza')).toBe('Gilson')
    expect(falaDoConvite(null)).toMatch(/^Oi! Eu sou a Bela/)
    expect(falaDoConvite('Thiago Lima')).toMatch(/^Oi, Thiago!/)
  })

  it('estados em texto', () => {
    expect(ondeEmTexto([])).toBe('em todo o Brasil')
    expect(ondeEmTexto(['DF'])).toBe('em DF')
    expect(ondeEmTexto(['DF', 'GO'])).toBe('em DF e GO')
    expect(ondeEmTexto(['DF', 'GO', 'MG', 'SP'])).toBe('em 4 estados')
  })

  it('resultado com e sem licitação', () => {
    expect(falaDoResultado('Uniformes', ['DF'], 1)).toContain('Achei 1 licitação')
    expect(falaDoResultado('Uniformes', ['DF'], 1200)).toContain('Achei 1.200 licitações')
    expect(falaDoResultado('Uniformes', ['DF'], 0)).toContain('Ainda não achei licitação aberta de uniformes em DF')
  })

  it('nome do item, comparação de estados e link das abertas', () => {
    expect(nomeDoItem('  material   de limpeza ')).toBe('Material de limpeza')
    expect(mesmosEstados(['GO', 'DF'], ['DF', 'GO'])).toBe(true)
    expect(mesmosEstados(['DF'], [])).toBe(false)
    expect(linkDasAbertas('uniformes', [])).toBe('/tenders?q=uniformes&situacao=ABERTA&relacionadas=0')
    expect(linkDasAbertas('uniformes', ['DF'])).toBe('/tenders?q=uniformes&situacao=ABERTA&relacionadas=0&uf=DF')
  })
})
