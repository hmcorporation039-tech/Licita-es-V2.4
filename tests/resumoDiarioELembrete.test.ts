import { describe, expect, it } from 'vitest'
import {
  MAX_LICITACOES_NO_RESUMO,
  agruparMatchesDoResumo,
  assuntoDoLembreteDePrazo,
  assuntoDoResumoDiario,
  montarEmailDoLembreteDePrazo,
  montarEmailDoResumoDiario,
  type LicitacaoDoAviso,
  type MatchParaResumo,
} from '../src/services/emailService'
import { dataDeBrasilia, diaDeBrasilia } from '../src/lib/dataDeBrasilia'
import { marcoDoLembrete, momentoDoFimDoPrazo, textoDoTempoRestante } from '../src/lib/prazoDoAviso'
import { parseDataBr } from '../src/lib/scrapingHelpers'

const ENV = { APP_URL: 'https://app.licitabela.com.br' } as NodeJS.ProcessEnv
const HORA_MS = 3_600_000

function licitacao(tenderId: string, extra: Partial<LicitacaoDoAviso> = {}): LicitacaoDoAviso {
  return {
    tenderId,
    objeto: `Objeto ${tenderId}`,
    fonte: 'PNCP',
    orgao: `Órgão ${tenderId}`,
    municipio: 'Anápolis',
    uf: 'GO',
    encerramentoAt: null,
    aberturaAt: null,
    ...extra,
  }
}

function match(tenderMatchId: string, itemName: string, alvo: LicitacaoDoAviso, dentroDeObraCompleta = false): MatchParaResumo {
  return { tenderMatchId, itemName, dentroDeObraCompleta, licitacao: alvo }
}

function textoDoHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&rarr;/g, '').replace(/\s+/g, ' ')
}

describe('resumo diário: agrupamento e ordem', () => {
  it('vários itens casando a mesma licitação viram uma linha só, com os itens juntos', () => {
    const t1 = licitacao('t1', { encerramentoAt: dataDeBrasilia('2026-10-25T10:00:00') })
    const grupos = agruparMatchesDoResumo([match('m1', 'Cimento', t1), match('m2', 'Areia', t1), match('m3', 'Cimento', t1)])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].itens).toEqual(['Cimento', 'Areia'])
    expect(grupos[0].tenderMatchIds).toEqual(['m1', 'm2', 'm3'])
  })

  it('prazo mais próximo primeiro, sem prazo depois e obra completa no fim', () => {
    const longe = licitacao('longe', { encerramentoAt: dataDeBrasilia('2026-11-10T10:00:00') })
    const perto = licitacao('perto', { encerramentoAt: dataDeBrasilia('2026-10-21T10:00:00') })
    const semPrazo = licitacao('sem-prazo')
    const obra = licitacao('obra', { encerramentoAt: dataDeBrasilia('2026-10-20T08:00:00') })
    const ordem = agruparMatchesDoResumo([
      match('a', 'Item', longe),
      match('b', 'Item', semPrazo),
      match('c', 'Item', obra, true),
      match('d', 'Item', perto),
    ]).map((g) => g.tenderId)
    expect(ordem).toEqual(['perto', 'longe', 'sem-prazo', 'obra'])
  })

  it('licitação só é obra completa quando todos os matches dela são de obra completa', () => {
    const t = licitacao('t', { encerramentoAt: dataDeBrasilia('2026-10-25T10:00:00') })
    const [grupo] = agruparMatchesDoResumo([match('a', 'Cimento', t, true), match('b', 'Tijolo', t, false)])
    expect(grupo.dentroDeObraCompleta).toBe(false)
  })

  it('prazo só com o dia ordena pelo fim do dia em Brasília', () => {
    const diaInteiro = licitacao('dia', { fonte: 'SESC_REGIONAL', encerramentoAt: parseDataBr('21/10/2026') })
    const meioDoDia = licitacao('meio', { encerramentoAt: dataDeBrasilia('2026-10-21T12:00:00') })
    expect(agruparMatchesDoResumo([match('a', 'Item', diaInteiro), match('b', 'Item', meioDoDia)]).map((g) => g.tenderId)).toEqual(['meio', 'dia'])
  })
})

describe('resumo diário: e-mail', () => {
  it('assunto no singular e no plural', () => {
    expect(assuntoDoResumoDiario(1)).toBe('1 licitação nova para você hoje')
    expect(assuntoDoResumoDiario(4)).toBe('4 licitações novas para você hoje')
  })

  it('mostra objeto, órgão, município/UF, prazo em Brasília, item e link "Abrir"', () => {
    const t = licitacao('abc-1', { objeto: 'Compra de cimento CP-II', encerramentoAt: dataDeBrasilia('2026-10-20T21:00:00') })
    const grupos = agruparMatchesDoResumo([match('m1', 'Cimento', t), match('m2', 'Argamassa', t)])
    const { assunto, html } = montarEmailDoResumoDiario(grupos, ENV)
    const texto = textoDoHtml(html)
    expect(assunto).toBe('1 licitação nova para você hoje')
    expect(texto).toContain('Compra de cimento CP-II')
    expect(texto).toContain('Órgão abc-1')
    expect(texto).toContain('Anápolis/GO')
    expect(texto).toContain('Prazo para enviar a proposta: 20/10/2026 21:00')
    expect(texto).toContain('Itens: Cimento, Argamassa')
    expect(html).toContain('href="https://app.licitabela.com.br/tenders/abc-1"')
    expect(texto).toContain('Abrir')
    expect(texto).not.toContain('E mais')
    expect(html).toContain('href="https://app.licitabela.com.br/matches"')
  })

  it(`mostra até ${MAX_LICITACOES_NO_RESUMO} licitações e "e mais N" com botão para /matches`, () => {
    const matches = Array.from({ length: 17 }, (_, i) =>
      match(`m${i}`, 'Cimento', licitacao(`t${String(i).padStart(2, '0')}`, { encerramentoAt: new Date(Date.UTC(2026, 10, 1 + i, 13)) }))
    )
    const { assunto, html } = montarEmailDoResumoDiario(agruparMatchesDoResumo(matches), ENV)
    const texto = textoDoHtml(html)
    expect(assunto).toBe('17 licitações novas para você hoje')
    expect(html).toContain('/tenders/t14"')
    expect(html).not.toContain('/tenders/t15"')
    expect(texto).toContain('E mais 2 licitações no painel.')
    expect(texto).toContain('Ver todas as licitações')
    expect(html).toContain('href="https://app.licitabela.com.br/matches"')
  })

  it('"e mais 1 licitação" no singular', () => {
    const matches = Array.from({ length: 16 }, (_, i) => match(`m${i}`, 'Cimento', licitacao(`t${i}`)))
    expect(textoDoHtml(montarEmailDoResumoDiario(agruparMatchesDoResumo(matches), ENV).html)).toContain('E mais 1 licitação no painel.')
  })

  it('obra completa aparece marcada', () => {
    const t = licitacao('obra', { encerramentoAt: dataDeBrasilia('2026-10-25T10:00:00') })
    expect(textoDoHtml(montarEmailDoResumoDiario(agruparMatchesDoResumo([match('m', 'Tijolo', t, true)]), ENV).html)).toContain('Faz parte de uma obra completa')
  })
})

describe('lembrete de prazo', () => {
  const agora = dataDeBrasilia('2026-10-20T10:00:00')!

  it('marco certo em cada momento: 48 h, 24 h, nada fora da janela ou já vencido', () => {
    const fim = new Date(agora.getTime() + 48 * HORA_MS)
    expect(marcoDoLembrete(fim, agora)).toBe(48)
    expect(marcoDoLembrete(new Date(agora.getTime() + 48 * HORA_MS + 1), agora)).toBeNull()
    expect(marcoDoLembrete(new Date(agora.getTime() + 25 * HORA_MS), agora)).toBe(48)
    expect(marcoDoLembrete(new Date(agora.getTime() + 24 * HORA_MS), agora)).toBe(24)
    expect(marcoDoLembrete(new Date(agora.getTime() + 60_000), agora)).toBe(24)
    expect(marcoDoLembrete(agora, agora)).toBeNull()
    expect(marcoDoLembrete(new Date(agora.getTime() - 60_000), agora)).toBeNull()
  })

  it('prazo só com o dia vale até o fim do dia em Brasília', () => {
    const fim = momentoDoFimDoPrazo({ fonte: 'SESC_REGIONAL', encerramentoAt: parseDataBr('21/10/2026') ?? null, aberturaAt: null })!
    expect(fim.toISOString()).toBe('2026-10-22T02:59:59.000Z')
  })

  it('no PNCP o início das propostas não conta como prazo', () => {
    expect(momentoDoFimDoPrazo({ fonte: 'PNCP', encerramentoAt: null, aberturaAt: agora })).toBeNull()
    expect(momentoDoFimDoPrazo({ fonte: 'FIEG', encerramentoAt: null, aberturaAt: dataDeBrasilia('2026-10-21T09:00:00')! })).toEqual(dataDeBrasilia('2026-10-21T09:00:00'))
  })

  it('tempo restante em horas, no singular e no plural', () => {
    expect(textoDoTempoRestante(new Date(agora.getTime() + 47.5 * HORA_MS), agora)).toBe('faltam 47 horas')
    expect(textoDoTempoRestante(new Date(agora.getTime() + 1.5 * HORA_MS), agora)).toBe('falta 1 hora')
    expect(textoDoTempoRestante(new Date(agora.getTime() + 0.5 * HORA_MS), agora)).toBe('falta menos de 1 hora')
  })

  it('assunto no singular e no plural', () => {
    expect(assuntoDoLembreteDePrazo(1)).toBe('Prazo encerrando: 1 licitação escolhida')
    expect(assuntoDoLembreteDePrazo(2)).toBe('Prazo encerrando: 2 licitações escolhidas')
  })

  it('lista as licitações da rodada pela ordem do prazo, com hora de Brasília e link para as escolhidas', () => {
    const depois = { ...licitacao('depois', { encerramentoAt: dataDeBrasilia('2026-10-22T09:30:00') }), fimDoPrazo: dataDeBrasilia('2026-10-22T09:30:00')! }
    const antes = { ...licitacao('antes', { encerramentoAt: dataDeBrasilia('2026-10-21T09:00:00') }), fimDoPrazo: dataDeBrasilia('2026-10-21T09:00:00')! }
    const { assunto, html } = montarEmailDoLembreteDePrazo([depois, antes], agora, ENV)
    const texto = textoDoHtml(html)
    expect(assunto).toBe('Prazo encerrando: 2 licitações escolhidas')
    expect(texto.indexOf('Objeto antes')).toBeLessThan(texto.indexOf('Objeto depois'))
    expect(texto).toContain('Prazo para enviar a proposta: 21/10/2026 09:00 (faltam 23 horas)')
    expect(texto).toContain('Prazo para enviar a proposta: 22/10/2026 09:30 (faltam 47 horas)')
    expect(html).toContain('href="https://app.licitabela.com.br/escolhidas"')
    expect(html).toContain('href="https://app.licitabela.com.br/tenders/antes"')
  })
})

describe('dia do resumo', () => {
  it('é o dia de Brasília, não o dia UTC', () => {
    expect(diaDeBrasilia(new Date('2026-10-21T02:00:00Z'))).toBe('2026-10-20')
    expect(diaDeBrasilia(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-21')
  })
})
