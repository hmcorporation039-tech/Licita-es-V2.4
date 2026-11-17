import { describe, expect, it } from 'vitest'
import { conversaoDoAds } from '../web/src/lib/medicao'

describe('conversão do Google Ads', () => {
  it('lê o código "AW-…/rótulo" e separa a conta', () => {
    expect(conversaoDoAds('AW-123456789/AbCdEf_12')).toEqual({ conta: 'AW-123456789', enviarPara: 'AW-123456789/AbCdEf_12' })
    expect(conversaoDoAds('  AW-123456789/AbCd  ')).toEqual({ conta: 'AW-123456789', enviarPara: 'AW-123456789/AbCd' })
  })

  it('vazio ou fora do formato desliga o Google Ads', () => {
    expect(conversaoDoAds('')).toBeNull()
    expect(conversaoDoAds(undefined)).toBeNull()
    expect(conversaoDoAds('AW-123456789')).toBeNull()
    expect(conversaoDoAds('G-ZJQHVTXD35')).toBeNull()
    expect(conversaoDoAds('AW-123/x"><script>')).toBeNull()
  })
})
