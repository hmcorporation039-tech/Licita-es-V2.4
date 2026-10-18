import { describe, expect, it } from 'vitest'
import { acessoDoDestinatario, empresaTemDonoComAcesso } from '../src/lib/acessoDaEmpresa'

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

describe('acessoDoDestinatario: quem pode receber e-mail de aviso', () => {
  const ontem = new Date(agora - 86_400_000)
  const amanha = new Date(agora + 86_400_000)
  const membro = { ...dono, isAdmin: false, companyRole: 'MEMBER' }
  const donoDaConta = { ...membro, companyRole: 'OWNER' }

  it('conta no prazo recebe', () => {
    expect(acessoDoDestinatario(donoDaConta, [dono], agora)).toEqual({ situacao: 'ativo' })
    expect(acessoDoDestinatario({ ...donoDaConta, accessExpiresAt: amanha }, [dono], agora)).toEqual({ situacao: 'ativo' })
    expect(acessoDoDestinatario(membro, [dono], agora)).toEqual({ situacao: 'ativo' })
  })

  it('teste vencido não recebe e informa até quando valeu', () => {
    expect(acessoDoDestinatario({ ...donoDaConta, accessExpiresAt: ontem }, [{ ...dono, accessExpiresAt: ontem }], agora)).toEqual({ situacao: 'encerrado', acessoAte: ontem })
    expect(acessoDoDestinatario(membro, [{ ...dono, accessExpiresAt: ontem }], agora)).toEqual({ situacao: 'encerrado', acessoAte: ontem })
  })

  it('conta desativada ou empresa com dono bloqueado não recebe nem aviso de fim de teste', () => {
    expect(acessoDoDestinatario({ ...donoDaConta, active: false }, [dono], agora)).toEqual({ situacao: 'bloqueado' })
    expect(acessoDoDestinatario(membro, [{ ...dono, disabledByAdmin: true }], agora)).toEqual({ situacao: 'bloqueado' })
  })
})
