import { describe, expect, it } from 'vitest'
import { LIMITES_PADRAO, bloqueiaNovo, excedeu, inicioDoMesBrasilia, lerLimites, limitesEfetivos, quantidadeDoRecurso } from '../src/lib/planos'
import { avisoDoUsoDoPlano, resumoDosLimites, situacaoDoRecurso } from '../web/src/lib/planos'

describe('resumo dos limites do teste grátis no cadastro', () => {
  it('mostra os limites reais do plano, no singular e no plural', () => {
    expect(resumoDosLimites({ itensMonitorados: 3, usuarios: 1, analisesIaMes: 3, perguntasAoEditalMes: 30 })).toBe('até 3 itens monitorados, 1 usuário, 3 análises de edital e 30 perguntas ao edital')
    expect(resumoDosLimites({ itensMonitorados: null, usuarios: 2, analisesIaMes: null, perguntasAoEditalMes: null })).toBe('até 2 usuários')
    expect(resumoDosLimites({ itensMonitorados: null, usuarios: null, analisesIaMes: null, perguntasAoEditalMes: null })).toBeNull()
    expect(resumoDosLimites(null)).toBeNull()
  })
})

describe('quantidadeDoRecurso', () => {
  it('concorda o rótulo com a quantidade', () => {
    expect(quantidadeDoRecurso('usuarios', 1)).toBe('1 usuário')
    expect(quantidadeDoRecurso('usuarios', 3)).toBe('3 usuários')
    expect(quantidadeDoRecurso('itensMonitorados', 1)).toBe('1 item monitorado')
    expect(quantidadeDoRecurso('analisesIaMes', 3)).toBe('3 análises de edital no mês')
  })
})

describe('lerLimites', () => {
  it('lê limites válidos, inclusive null (ilimitado)', () => {
    expect(lerLimites({ itensMonitorados: null, usuarios: 5, analisesIaMes: 40, perguntasAoEditalMes: null, mensagensDeSuporteMes: 300, analisesDeConcorrenteMes: 40 })).toEqual({
      itensMonitorados: null,
      usuarios: 5,
      analisesIaMes: 40,
      perguntasAoEditalMes: null,
      mensagensDeSuporteMes: 300,
      analisesDeConcorrenteMes: 40,
    })
  })

  it('chave ausente ou inválida cai no padrão restritivo, nunca em ilimitado', () => {
    expect(lerLimites({ itensMonitorados: -1, usuarios: 'muitos' })).toEqual(LIMITES_PADRAO)
    expect(lerLimites(null)).toEqual(LIMITES_PADRAO)
    expect(lerLimites('lixo')).toEqual(LIMITES_PADRAO)
  })
})

describe('limitesEfetivos', () => {
  const plano = { itensMonitorados: 10, usuarios: 1, analisesIaMes: 10, perguntasAoEditalMes: 150, mensagensDeSuporteMes: 100, analisesDeConcorrenteMes: 15 }

  it('sem ajuste vale o plano', () => {
    expect(limitesEfetivos(plano, null)).toEqual(plano)
  })

  it('o ajuste combinado com o cliente vence o plano, só nas chaves informadas', () => {
    expect(limitesEfetivos(plano, { itensMonitorados: 30 })).toEqual({ itensMonitorados: 30, usuarios: 1, analisesIaMes: 10, perguntasAoEditalMes: 150, mensagensDeSuporteMes: 100, analisesDeConcorrenteMes: 15 })
    expect(limitesEfetivos(plano, { usuarios: null }).usuarios).toBeNull()
  })
})

describe('bloqueiaNovo', () => {
  it('bloqueia criar mais um ao atingir o limite (usado >= limite)', () => {
    expect(bloqueiaNovo(3, 3)).toBe(true)
    expect(bloqueiaNovo(2, 3)).toBe(false)
  })

  it('limite 0 bloqueia tudo; null nunca bloqueia', () => {
    expect(bloqueiaNovo(0, 0)).toBe(true)
    expect(bloqueiaNovo(1_000_000, null)).toBe(false)
  })
})

describe('excedeu', () => {
  it('estar no limite não é exceder: só passa quando o uso é maior que o limite', () => {
    expect(excedeu(1, 1)).toBe(false)
    expect(excedeu(3, 3)).toBe(false)
    expect(excedeu(4, 3)).toBe(true)
    expect(excedeu(0, 0)).toBe(false)
    expect(excedeu(1_000_000, null)).toBe(false)
  })
})

describe('uso do plano na tela', () => {
  const usuarios = (usado: number, limite: number | null) => ({ rotulo: 'usuários', usado, limite })

  it('conta Teste com 1 usuário de 1 não mostra alerta vermelho, só uma informação', () => {
    expect(situacaoDoRecurso(1, 1)).toBe('no-limite')
    expect(avisoDoUsoDoPlano([usuarios(1, 1), { rotulo: 'itens monitorados', usado: 0, limite: 3 }])).toEqual({
      tom: 'info',
      texto: 'Você já usa tudo o que o plano inclui em usuários. Para adicionar mais, fale com o administrador.',
    })
  })

  it('só fica vermelho quando o uso passa do limite', () => {
    expect(situacaoDoRecurso(4, 3)).toBe('excedido')
    expect(avisoDoUsoDoPlano([usuarios(1, 1), { rotulo: 'itens monitorados', usado: 5, limite: 3 }])).toEqual({
      tom: 'perigo',
      texto: 'Você passou do limite do plano em itens monitorados. Fale com o administrador para ampliá-lo.',
    })
  })

  it('longe do limite ou sem limite não mostra aviso', () => {
    expect(situacaoDoRecurso(1, 10)).toBe('livre')
    expect(situacaoDoRecurso(8, 10)).toBe('perto')
    expect(situacaoDoRecurso(50, null)).toBe('sem-limite')
    expect(avisoDoUsoDoPlano([usuarios(1, 10), usuarios(9, null)])).toBeNull()
  })
})

describe('inicioDoMesBrasilia', () => {
  it('o mês começa às 03:00 UTC do dia 1º', () => {
    expect(inicioDoMesBrasilia(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  it('nas primeiras horas UTC do dia 1º, Brasília ainda está no mês anterior', () => {
    expect(inicioDoMesBrasilia(new Date('2026-10-01T01:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })
})
