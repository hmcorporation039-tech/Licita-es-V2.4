import { describe, expect, it } from 'vitest'
import {
  JANELA_MAXIMA_DIAS,
  LOOKBACK_PADRAO_DIAS,
  formatDateOnly,
  resolveColetaWindow,
} from '../src/lib/coletaWindow'

const DIA_MS = 24 * 60 * 60 * 1000
const agora = new Date('2026-09-15T10:00:00.000Z')

function diasAtras(dias: number): Date {
  return new Date(agora.getTime() - dias * DIA_MS)
}

describe('resolveColetaWindow', () => {
  // Este é o teste do P0-01: o agendador repetível do BullMQ reaproveita o
  // payload em toda repetição, então a janela NÃO pode vir de lá.
  it('deriva a janela do relógio quando o payload não traz datas', () => {
    const janela = resolveColetaWindow({}, { now: agora })
    expect(janela.dataFinal).toBe('2026-09-15')
    expect(janela.dataInicial).toBe(formatDateOnly(diasAtras(LOOKBACK_PADRAO_DIAS)))
  })

  it('avança junto com o relógio em execuções diferentes', () => {
    const hoje = resolveColetaWindow({}, { now: agora })
    const amanha = resolveColetaWindow({}, { now: new Date(agora.getTime() + DIA_MS) })
    expect(amanha.dataFinal).not.toBe(hoje.dataFinal)
    expect(amanha.dataFinal).toBe('2026-09-16')
  })

  it('respeita a janela explícita de um backfill manual', () => {
    const janela = resolveColetaWindow(
      { dataInicial: '2026-01-01', dataFinal: '2026-01-31' },
      { now: agora }
    )
    expect(janela).toEqual({ dataInicial: '2026-01-01', dataFinal: '2026-01-31' })
  })

  it('estende a janela para trás quando a coleta ficou parada', () => {
    const janela = resolveColetaWindow({}, { now: agora, ultimaPublicacaoColetada: diasAtras(9) })
    expect(janela.dataInicial).toBe(formatDateOnly(diasAtras(10)))
  })

  it('nunca encolhe abaixo do lookback padrão, mesmo com cursor recente', () => {
    const janela = resolveColetaWindow({}, { now: agora, ultimaPublicacaoColetada: agora })
    expect(janela.dataInicial).toBe(formatDateOnly(diasAtras(LOOKBACK_PADRAO_DIAS)))
  })

  it('limita a janela mesmo com cursor muito antigo', () => {
    const janela = resolveColetaWindow({}, { now: agora, ultimaPublicacaoColetada: diasAtras(400) })
    expect(janela.dataInicial).toBe(formatDateOnly(diasAtras(JANELA_MAXIMA_DIAS)))
  })

  it('usa o lookback padrão quando a base está vazia', () => {
    const janela = resolveColetaWindow({}, { now: agora, ultimaPublicacaoColetada: null })
    expect(janela.dataInicial).toBe(formatDateOnly(diasAtras(LOOKBACK_PADRAO_DIAS)))
  })
})
