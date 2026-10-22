import { describe, expect, it } from 'vitest'
import { decidirLance } from '../src/lib/motorDeLance'

const regras = { decrementoPct: 0.5, maxLances: 2 }
const base = { melhorLance: 180000, meuMenorLance: null, piso: 130000, regras, meusLances: 0 }

describe('decidirLance', () => {
  it('dá o próximo lance quando está acima do piso', () => {
    expect(decidirLance(base)).toEqual({ acao: 'dar', valor: 179100 })
  })

  it('aguarda sem piso definido', () => {
    expect(decidirLance({ ...base, piso: 0 }).acao).toBe('aguardar')
  })

  it('aguarda quando ainda não há melhor lance', () => {
    expect(decidirLance({ ...base, melhorLance: null }).acao).toBe('aguardar')
  })

  it('aguarda quando o cliente já está na frente', () => {
    expect(decidirLance({ ...base, meuMenorLance: 170000 }).acao).toBe('aguardar')
  })

  it('trava ao atingir o limite de lances', () => {
    const d = decidirLance({ ...base, meusLances: 2 })
    expect(d.acao).toBe('travar')
  })

  it('trava quando o melhor lance já está no piso ou abaixo', () => {
    expect(decidirLance({ ...base, melhorLance: 130000 }).acao).toBe('travar')
    expect(decidirLance({ ...base, melhorLance: 125000 }).acao).toBe('travar')
  })

  it('trava quando o próximo lance válido cairia abaixo do piso', () => {
    const d = decidirLance({ ...base, melhorLance: 180000, piso: 179500 })
    expect(d.acao).toBe('travar')
  })

  it('nunca propõe um valor abaixo do piso', () => {
    for (let piso = 100000; piso < 180000; piso += 2500) {
      const d = decidirLance({ ...base, piso })
      if (d.acao === 'dar') expect(d.valor).toBeGreaterThanOrEqual(piso)
    }
  })
})
