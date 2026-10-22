import { describe, expect, it } from 'vitest'
import { adaptadorDe, portaisComAdaptador } from '../src/services/portais/registro'
import { AutomacaoNaoDisponivel } from '../src/services/portais/tipos'

describe('registro de adaptadores de portal', () => {
  it('tem o adaptador do Compras.gov.br', () => {
    expect(portaisComAdaptador()).toContain('COMPRASNET')
    expect(adaptadorDe('COMPRASNET')).not.toBeNull()
  })

  it('devolve null para portal sem adaptador', () => {
    expect(adaptadorDe('PORTAL_INEXISTENTE')).toBeNull()
  })
})

describe('adaptador do Compras.gov.br (sessão real pendente)', () => {
  const adaptador = adaptadorDe('COMPRASNET')!

  it('declara login com CAPTCHA e automação assistida', () => {
    expect(adaptador.loginComCaptcha).toBe(true)
    expect(adaptador.automacao).toBe('confirmar')
  })

  it('recusa entrar até a validação contra a sala de disputa real', async () => {
    await expect(adaptador.entrar('empresa-1', { login: 'x', senha: 'y' })).rejects.toBeInstanceOf(AutomacaoNaoDisponivel)
    await expect(adaptador.entrar('empresa-1', { login: 'x', senha: 'y' })).rejects.toMatchObject({ motivo: 'SESSAO_REAL_PENDENTE' })
  })

  it('recusa dar lance até a validação', async () => {
    const sessao = { portalId: 'COMPRASNET', companyId: 'empresa-1', autenticadaEm: new Date() }
    await expect(adaptador.darLance(sessao, 'item-1', 100)).rejects.toBeInstanceOf(AutomacaoNaoDisponivel)
  })
})
