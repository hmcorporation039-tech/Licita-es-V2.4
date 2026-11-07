import { describe, expect, it } from 'vitest'
import { avisoDoLimite, horaEmBrasilia, mensagemDoLimite } from '../src/lib/limiteDeEsclarecimento'

// Sessão da Assembleia do ES: 18/11/2026 (quarta) às 15h de Brasília = 18h UTC.
// Limite (3 dias úteis antes): 13/11 (sexta). Véspera útil: 12/11 (quinta).
const SESSAO = new Date('2026-11-18T18:00:00Z')
const brasilia = (iso: string) => new Date(`${iso}-03:00`)

describe('avisoDoLimite', () => {
  it('avisa na véspera útil e no último dia', () => {
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-12T10:00:00'))).toEqual({ marco: 'vespera', limite: '2026-11-13' })
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-13T09:00:00'))).toEqual({ marco: 'ultimo-dia', limite: '2026-11-13' })
  })

  it('não avisa antes, depois, de madrugada nem no fim de semana', () => {
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-11T10:00:00'))).toBeNull()
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-16T10:00:00'))).toBeNull()
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-13T06:00:00'))).toBeNull()
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-13T19:00:00'))).toBeNull()
    expect(avisoDoLimite(SESSAO, brasilia('2026-11-14T10:00:00'))).toBeNull()
  })

  it('lê a hora de Brasília', () => {
    expect(horaEmBrasilia(new Date('2026-11-13T12:00:00Z'))).toBe(9)
    expect(horaEmBrasilia(new Date('2026-11-13T03:00:00Z'))).toBe(0)
  })
})

describe('mensagemDoLimite', () => {
  it('uma licitação: leva direto para os documentos', () => {
    const m = mensagemDoLimite([{ tenderId: 't1', objeto: 'Material elétrico', aviso: { marco: 'ultimo-dia', limite: '2026-11-13' } }])
    expect(m.titulo).toBe('Hoje é o último dia para pedir esclarecimento')
    expect(m.url).toBe('/tenders/t1/documentos')
  })

  it('véspera mostra a data limite', () => {
    const m = mensagemDoLimite([{ tenderId: 't1', objeto: 'Material elétrico', aviso: { marco: 'vespera', limite: '2026-11-13' } }])
    expect(m.titulo).toBe('Esclarecimento e impugnação: até 13/11/2026')
  })

  it('várias licitações viram um aviso só', () => {
    const m = mensagemDoLimite([
      { tenderId: 't2', objeto: 'B', aviso: { marco: 'vespera', limite: '2026-11-16' } },
      { tenderId: 't1', objeto: 'A', aviso: { marco: 'ultimo-dia', limite: '2026-11-13' } },
    ])
    expect(m.titulo).toBe('2 licitações com prazo de esclarecimento acabando')
    expect(m.corpo).toContain('Hoje é o último dia: A e mais 1.')
  })
})
