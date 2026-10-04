import { describe, expect, it } from 'vitest'
import {
  calcularPrazosDaSessao,
  diaEmBrasilia,
  diasUteisEntre,
  ehDiaUtil,
  feriadosNacionais,
  lerDataTexto,
  somarDiasUteis,
} from '../src/lib/diasUteis'

describe('feriadosNacionais', () => {
  it('calcula a Páscoa e a sexta-feira santa (2026: Páscoa em 5/4, sexta santa 3/4)', () => {
    expect(feriadosNacionais(2026)).toContain('2026-04-03')
  })

  it('consciência negra só é nacional a partir de 2024', () => {
    expect(feriadosNacionais(2023)).not.toContain('2023-11-20')
    expect(feriadosNacionais(2024)).toContain('2024-11-20')
  })

  it('carnaval e corpus christi só entram como ponto facultativo se pedido', () => {
    expect(feriadosNacionais(2026)).not.toContain('2026-02-17')
    expect(feriadosNacionais(2026, { pontosFacultativos: true })).toContain('2026-02-17')
    expect(feriadosNacionais(2026, { pontosFacultativos: true })).toContain('2026-06-04')
  })
})

describe('ehDiaUtil', () => {
  it('fim de semana e feriado não são úteis', () => {
    expect(ehDiaUtil('2026-10-03')).toBe(false) // sábado
    expect(ehDiaUtil('2026-10-04')).toBe(false) // domingo
    expect(ehDiaUtil('2026-10-12')).toBe(false) // Aparecida (segunda)
    expect(ehDiaUtil('2026-10-13')).toBe(true)
  })
})

describe('somarDiasUteis', () => {
  it('soma pulando fim de semana', () => {
    expect(somarDiasUteis('2026-10-01', 3)).toBe('2026-10-06') // qui + 3 = ter
  })

  it('subtrai pulando feriado (13/10 menos 1 dia útil cai em 9/10, pois 12/10 é feriado e 10-11 é fim de semana)', () => {
    expect(somarDiasUteis('2026-10-13', -1)).toBe('2026-10-09')
  })

  it('zero dia útil devolve o mesmo dia', () => {
    expect(somarDiasUteis('2026-10-01', 0)).toBe('2026-10-01')
  })
})

describe('diasUteisEntre', () => {
  it('conta (de, até] e é negativo para o passado', () => {
    expect(diasUteisEntre('2026-10-01', '2026-10-06')).toBe(3)
    expect(diasUteisEntre('2026-10-06', '2026-10-01')).toBe(-3)
    expect(diasUteisEntre('2026-10-01', '2026-10-01')).toBe(0)
  })
})

describe('calcularPrazosDaSessao (art. 164: 3 dias úteis antes da abertura)', () => {
  const agora = new Date('2026-10-01T15:00:00Z')

  it('sessão numa quarta: limite é a quinta anterior', () => {
    // sessão 14/10/2026 (quarta). 3 úteis antes: 13/10 (ter), 9/10 (sex; 12/10 é feriado), 8/10 (qui)
    const p = calcularPrazosDaSessao(new Date('2026-10-14T13:00:00Z'), agora)
    expect(p.dataSessao).toBe('2026-10-14')
    expect(p.limiteImpugnacao).toBe('2026-10-08')
    expect(p.limitePassou).toBe(false)
    expect(p.sessaoPassou).toBe(false)
    expect(p.diasUteisAteLimite).toBe(5)
  })

  it('marca como vencido quando o limite já passou', () => {
    const p = calcularPrazosDaSessao(new Date('2026-10-02T13:00:00Z'), agora)
    expect(p.limitePassou).toBe(true)
  })

  it('usa o dia de Brasília: 01h UTC de 15/10 ainda é 14/10 à noite em Brasília', () => {
    expect(diaEmBrasilia(new Date('2026-10-15T01:00:00Z'))).toBe('2026-10-14')
  })
})

describe('lerDataTexto', () => {
  it('lê dd/mm/aaaa com e sem hora', () => {
    expect(lerDataTexto('10/11/2026')?.toISOString()).toBe('2026-11-10T15:00:00.000Z')
    expect(lerDataTexto('A sessão será em 10/11/2026 às 09:30')?.toISOString()).toBe('2026-11-10T12:30:00.000Z')
    expect(lerDataTexto('10/11/2026 às 14h00')?.toISOString()).toBe('2026-11-10T17:00:00.000Z')
  })

  it('lê ISO', () => {
    expect(lerDataTexto('2026-11-10')?.toISOString()).toBe('2026-11-10T15:00:00.000Z')
  })

  it('não chuta: texto sem data e data inexistente viram null', () => {
    expect(lerDataTexto('a definir')).toBeNull()
    expect(lerDataTexto('')).toBeNull()
    expect(lerDataTexto(undefined)).toBeNull()
    expect(lerDataTexto('31/02/2026')).toBeNull()
  })
})
