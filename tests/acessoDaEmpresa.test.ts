import { describe, expect, it } from 'vitest'
import { empresaTemDonoComAcesso } from '../src/lib/acessoDaEmpresa'

const agora = new Date('2026-10-13T12:00:00Z').getTime()
const dono = { active: true, disabledByAdmin: false, accessExpiresAt: null as Date | null }

describe('empresaTemDonoComAcesso', () => {
  it('libera quando há um dono ativo e no prazo', () => {
    expect(empresaTemDonoComAcesso([dono], agora)).toBe(true)
    expect(empresaTemDonoComAcesso([{ ...dono, accessExpiresAt: new Date(agora + 1000) }], agora)).toBe(true)
  })

  it('bloqueia quando o dono foi desativado, bloqueado pelo admin ou venceu', () => {
    expect(empresaTemDonoComAcesso([{ ...dono, active: false }], agora)).toBe(false)
    expect(empresaTemDonoComAcesso([{ ...dono, disabledByAdmin: true }], agora)).toBe(false)
    expect(empresaTemDonoComAcesso([{ ...dono, accessExpiresAt: new Date(agora - 1000) }], agora)).toBe(false)
  })

  it('bloqueia empresa sem dono e libera se ao menos um dono tiver acesso', () => {
    expect(empresaTemDonoComAcesso([], agora)).toBe(false)
    expect(empresaTemDonoComAcesso([{ ...dono, active: false }, dono], agora)).toBe(true)
  })
})
