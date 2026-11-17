import { describe, expect, it } from 'vitest'
import {
  chaveDaOrigem,
  ehCadastroPublico,
  lerOrigem,
  lerPeriodo,
  linkDoWhatsApp,
  montarFunil,
  numeroParaWhatsApp,
  semanaDe,
  taxa,
  taxasDoFunil,
  usouOSistema,
  type CadastroDoFunil,
} from '../src/lib/funilDeVendas'

describe('período do funil', () => {
  it('aceita 7, 30 e 90; o resto vira 30', () => {
    expect(lerPeriodo('7')).toBe(7)
    expect(lerPeriodo('90')).toBe(90)
    expect(lerPeriodo(['30'])).toBe(30)
    expect(lerPeriodo(undefined)).toBe(30)
    expect(lerPeriodo('15')).toBe(30)
    expect(lerPeriodo('abc')).toBe(30)
  })
})

describe('cadastro público', () => {
  const criado = new Date('2026-11-10T12:00:00Z')
  it('aceite dos termos no mesmo instante da criação conta', () => {
    expect(ehCadastroPublico({ createdAt: criado, termsAcceptedAt: new Date(criado.getTime() + 40) })).toBe(true)
  })
  it('conta criada pelo admin (aceite depois ou nenhum) e o próprio admin não contam', () => {
    expect(ehCadastroPublico({ createdAt: criado, termsAcceptedAt: null })).toBe(false)
    expect(ehCadastroPublico({ createdAt: criado, termsAcceptedAt: new Date(criado.getTime() + 2 * 86_400_000) })).toBe(false)
    expect(ehCadastroPublico({ createdAt: criado, termsAcceptedAt: criado, isAdmin: true })).toBe(false)
  })
})

describe('taxas de conversão', () => {
  it('uma casa decimal e null sem base', () => {
    expect(taxa(1, 3)).toBe(33.3)
    expect(taxa(2, 2)).toBe(100)
    expect(taxa(0, 5)).toBe(0)
    expect(taxa(0, 0)).toBeNull()
  })
  it('cada etapa sobre a anterior, e o total sobre os cadastros', () => {
    expect(taxasDoFunil({ cadastros: 10, emailConfirmado: 8, usaram: 4, pagantes: 1 })).toEqual({ confirmacao: 80, uso: 50, pagamento: 25, total: 10 })
    expect(taxasDoFunil({ cadastros: 0, emailConfirmado: 0, usaram: 0, pagantes: 0 })).toEqual({ confirmacao: null, uso: null, pagamento: null, total: null })
  })
})

describe('origem do cadastro', () => {
  it('sem UTM nem gclid é "direto"', () => {
    expect(lerOrigem(null)).toMatchObject({ fonte: 'direto', campanha: null, interesse: null })
    expect(lerOrigem({})).toMatchObject({ fonte: 'direto' })
    expect(lerOrigem({ utm_source: '   ' }).fonte).toBe('direto')
    expect(lerOrigem('lixo').fonte).toBe('direto')
  })
  it('lê fonte, meio, campanha, termo e interesse', () => {
    const o = lerOrigem({ utm_source: 'Instagram', utm_medium: 'social', utm_campaign: 'black-friday', utm_term: 'pregão', interesse: { termo: 'cadeiras', uf: 'go' } })
    expect(o).toEqual({ fonte: 'instagram', meio: 'social', campanha: 'black-friday', termo: 'pregão', anuncioDoGoogle: false, interesse: { termo: 'cadeiras', uf: 'GO' } })
    expect(chaveDaOrigem(o)).toBe('instagram / black-friday')
  })
  it('gclid sem utm_source vira google/cpc', () => {
    const o = lerOrigem({ gclid: 'abc', utm_campaign: 'pesquisa' })
    expect(o).toMatchObject({ fonte: 'google', meio: 'cpc', anuncioDoGoogle: true })
    expect(chaveDaOrigem(o)).toBe('google / pesquisa')
    expect(lerOrigem({ wbraid: 'x' }).fonte).toBe('google')
  })
  it('interesse sem UF', () => {
    expect(lerOrigem({ interesse: { termo: 'papel' } }).interesse).toEqual({ termo: 'papel', uf: null })
  })
})

describe('usou o sistema', () => {
  const nada = { itensMonitorados: 0, temInteresseNoCadastro: false, favoritos: 0, planosDeParticipacao: 0, perguntasAoEdital: 0, analisesPedidas: 0 }
  it('o item automático do interesse do cadastro não conta', () => {
    expect(usouOSistema({ ...nada, itensMonitorados: 1, temInteresseNoCadastro: true })).toBe(false)
    expect(usouOSistema({ ...nada, itensMonitorados: 2, temInteresseNoCadastro: true })).toBe(true)
    expect(usouOSistema({ ...nada, itensMonitorados: 1 })).toBe(true)
  })
  it('favorito, plano, pergunta ou análise contam', () => {
    expect(usouOSistema(nada)).toBe(false)
    expect(usouOSistema({ ...nada, favoritos: 1 })).toBe(true)
    expect(usouOSistema({ ...nada, planosDeParticipacao: 1 })).toBe(true)
    expect(usouOSistema({ ...nada, perguntasAoEdital: 1 })).toBe(true)
    expect(usouOSistema({ ...nada, analisesPedidas: 1 })).toBe(true)
  })
})

describe('telefone para o WhatsApp', () => {
  it('só dígitos, com 55 quando falta', () => {
    expect(numeroParaWhatsApp('(62) 99999-1234')).toBe('5562999991234')
    expect(numeroParaWhatsApp('62 3333-1234')).toBe('556233331234')
    expect(numeroParaWhatsApp('+55 (11) 98888-7777')).toBe('5511988887777')
    expect(numeroParaWhatsApp('0 62 99999-1234')).toBe('5562999991234')
    expect(linkDoWhatsApp('(62) 99999-1234')).toBe('https://wa.me/5562999991234')
  })
  it('vazio ou inválido não vira link', () => {
    expect(linkDoWhatsApp(null)).toBeNull()
    expect(linkDoWhatsApp('')).toBeNull()
    expect(linkDoWhatsApp('1234')).toBeNull()
    expect(linkDoWhatsApp('+55 62 1234')).toBeNull()
  })
  it('número estrangeiro com "+" é usado como veio', () => {
    expect(linkDoWhatsApp('+1 415 555 0100')).toBe('https://wa.me/14155550100')
  })
})

describe('montarFunil', () => {
  it('semana começa na segunda-feira, no horário de Brasília', () => {
    expect(semanaDe(new Date('2026-11-18T15:00:00Z'))).toBe('2026-11-16') // quarta
    expect(semanaDe(new Date('2026-11-16T03:30:00Z'))).toBe('2026-11-16') // segunda 00:30 em Brasília
    expect(semanaDe(new Date('2026-11-16T02:30:00Z'))).toBe('2026-11-09') // ainda domingo em Brasília
    expect(semanaDe(new Date('2026-11-22T20:00:00Z'))).toBe('2026-11-16') // domingo
  })

  it('soma por etapa, por semana (inclusive vazias) e por origem', () => {
    const c = (dia: string, e: Partial<CadastroDoFunil> = {}): CadastroDoFunil => ({
      criadoEm: new Date(dia + 'T15:00:00Z'),
      emailConfirmado: false,
      usou: false,
      pagante: false,
      origem: { fonte: 'direto', campanha: null },
      ...e,
    })
    const r = montarFunil(
      [
        c('2026-11-17', { emailConfirmado: true, usou: true, pagante: true, origem: { fonte: 'google', campanha: 'pesquisa' } }),
        c('2026-11-16', { emailConfirmado: true, usou: true, origem: { fonte: 'google', campanha: 'pesquisa' } }),
        c('2026-11-03', { emailConfirmado: true }),
        c('2026-11-02'),
      ],
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-11-17T18:00:00Z')
    )
    expect(r.totais).toEqual({ cadastros: 4, emailConfirmado: 3, usaram: 2, pagantes: 1 })
    expect(r.taxas).toEqual({ confirmacao: 75, uso: 66.7, pagamento: 50, total: 25 })
    expect(r.semanas.map((s) => [s.semana, s.cadastros])).toEqual([
      ['2026-11-16', 2],
      ['2026-11-09', 0],
      ['2026-11-02', 2],
      ['2026-10-26', 0],
    ])
    expect(r.origens).toEqual([
      { origem: 'google / pesquisa', fonte: 'google', campanha: 'pesquisa', cadastros: 2, emailConfirmado: 2, usaram: 2, pagantes: 1 },
      { origem: 'direto', fonte: 'direto', campanha: null, cadastros: 2, emailConfirmado: 1, usaram: 0, pagantes: 0 },
    ])
  })
})
