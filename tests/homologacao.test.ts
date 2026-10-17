import { describe, expect, it } from 'vitest'
import { valorHomologadoConfirmado } from '../src/lib/homologacao'

const AGORA = new Date('2026-10-17T15:00:00Z')
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000)

describe('valorHomologadoConfirmado', () => {
  it('zero ou vazio nunca é homologação', () => {
    expect(valorHomologadoConfirmado(0, null, AGORA)).toBeNull()
    expect(valorHomologadoConfirmado('0', dias(-3), AGORA)).toBeNull()
    expect(valorHomologadoConfirmado(null, dias(-3), AGORA)).toBeNull()
    expect(valorHomologadoConfirmado(undefined, null, AGORA)).toBeNull()
    expect(valorHomologadoConfirmado('', null, AGORA)).toBeNull()
  })

  it('licitação ainda recebendo propostas não está homologada, mesmo com valor preenchido', () => {
    expect(valorHomologadoConfirmado(15_000, dias(5), AGORA)).toBeNull()
  })

  it('valor positivo depois do prazo, ou sem prazo, é homologação', () => {
    expect(valorHomologadoConfirmado(15_000, dias(-1), AGORA)).toBe(15_000)
    expect(valorHomologadoConfirmado('2500.50', null, AGORA)).toBe(2500.5)
  })
})
