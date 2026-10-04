import { describe, expect, it } from 'vitest'
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, validarResultadoAnalise } from '../src/services/llm/types'

const CAMPOS_NOVOS = ['garantiaProposta', 'garantiaContratual', 'patrimonioLiquidoMinimo', 'visitaTecnica'] as const

describe('campos que alimentam os alertas legais', () => {
  it('estão no schema (obrigatórios) e no prompt', () => {
    for (const c of CAMPOS_NOVOS) {
      expect(ANALYSIS_SCHEMA.properties).toHaveProperty(c)
      expect(ANALYSIS_SCHEMA.required).toContain(c)
      expect(SYSTEM_PROMPT).toContain(`- ${c}:`)
    }
  })

  it('o validador mantém o texto e limita o tamanho', () => {
    const r = validarResultadoAnalise({ garantiaProposta: '1% do valor', visitaTecnica: 'x'.repeat(50_000) })
    expect(r.garantiaProposta).toBe('1% do valor')
    expect(r.visitaTecnica.length).toBeLessThanOrEqual(20_000)
  })

  it('campo ausente ou de tipo errado vira texto vazio, nunca quebra', () => {
    const r = validarResultadoAnalise({ garantiaContratual: 123, patrimonioLiquidoMinimo: null })
    expect(r.garantiaContratual).toBe('')
    expect(r.patrimonioLiquidoMinimo).toBe('')
    expect(r.garantiaProposta).toBe('')
  })

  it('o prompt manda tratar o edital como dado, não como instrução (defesa contra injeção)', () => {
    expect(SYSTEM_PROMPT).toMatch(/DADO a ser analisado/)
  })
})
