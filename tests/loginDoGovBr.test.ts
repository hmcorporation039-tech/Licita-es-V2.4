import { describe, expect, it } from 'vitest'
import { ehLoginDoGovBr } from '../web/src/lib/loginDoGovBr'

describe('ehLoginDoGovBr', () => {
  it('reconhece a tela de login do gov.br', () => {
    expect(ehLoginDoGovBr('sso.acesso.gov.br')).toBe(true)
    expect(ehLoginDoGovBr('SSO.ACESSO.GOV.BR')).toBe(true)
    expect(ehLoginDoGovBr('acesso.gov.br')).toBe(true)
  })

  it('não confunde com os portais nem com outros sites', () => {
    expect(ehLoginDoGovBr('www.gov.br')).toBe(false)
    expect(ehLoginDoGovBr('www.comprasnet.gov.br')).toBe(false)
    expect(ehLoginDoGovBr('cnetmobile.estaleiro.serpro.gov.br')).toBe(false)
    expect(ehLoginDoGovBr('acesso.gov.br.exemplo.com')).toBe(false)
    expect(ehLoginDoGovBr('naoacesso.gov.br')).toBe(false)
    expect(ehLoginDoGovBr(null)).toBe(false)
  })
})
