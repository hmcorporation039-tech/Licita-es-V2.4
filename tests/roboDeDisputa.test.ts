import { describe, expect, it } from 'vitest'
import { instrucaoDoAlvo, planejarRobo, type AlvoParaRobo } from '../src/lib/bela/roboDeDisputa'

const regras = { decrementoPct: 0.5, maxLances: 2 }
const base: AlvoParaRobo = { id: 'item-1', rotulo: 'Item 1', melhorLance: 180000, meuMenorLance: null, piso: 130000, meusLances: 0 }

describe('instrucaoDoAlvo', () => {
  it('manda dar o próximo lance quando está acima do piso', () => {
    const i = instrucaoDoAlvo(base, regras)
    expect(i.acao).toBe('dar')
    expect(i.valor).toBe(179100)
    expect(i.texto).toContain('Dar lance')
  })

  it('avisa que o próximo seria o último lance combinado', () => {
    const i = instrucaoDoAlvo({ ...base, meusLances: 1 }, regras)
    expect(i.acao).toBe('dar')
    expect(i.texto).toContain('último lance')
  })

  it('trava quando o melhor lance já está no piso', () => {
    const i = instrucaoDoAlvo({ ...base, melhorLance: 130000 }, regras)
    expect(i.acao).toBe('travar')
    expect(i.valor).toBeNull()
    expect(i.motivo).toBeTruthy()
  })

  it('nunca manda dar lance abaixo do piso', () => {
    const i = instrucaoDoAlvo({ ...base, melhorLance: 130200, piso: 130000 }, regras)
    expect(i.acao).toBe('travar')
  })

  it('pede o piso quando ele não está definido', () => {
    const i = instrucaoDoAlvo({ ...base, piso: null }, regras)
    expect(i.acao).toBe('aguardar')
    expect(i.texto).toContain('valor final mínimo')
  })

  it('aguarda quando o cliente já está na frente', () => {
    const i = instrucaoDoAlvo({ ...base, meuMenorLance: 170000 }, regras)
    expect(i.acao).toBe('aguardar')
  })

  it('aguarda quando ainda não há melhor lance', () => {
    const i = instrucaoDoAlvo({ ...base, melhorLance: null }, regras)
    expect(i.acao).toBe('aguardar')
  })
})

describe('planejarRobo', () => {
  it('devolve uma instrução por alvo, na ordem recebida', () => {
    const alvos: AlvoParaRobo[] = [base, { ...base, id: 'item-2', rotulo: 'Item 2', melhorLance: 130000 }]
    const plano = planejarRobo(alvos, regras)
    expect(plano.map((p) => p.alvo)).toEqual(['item-1', 'item-2'])
    expect(plano[0].acao).toBe('dar')
    expect(plano[1].acao).toBe('travar')
  })
})
