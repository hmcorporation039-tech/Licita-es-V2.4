import { describe, expect, it } from 'vitest'
import { conversaoDoAds } from '../web/src/lib/medicao'

describe('conversão do Google Ads', () => {
  it('lê o código "AW-…/rótulo" e separa a conta', () => {
    expect(conversaoDoAds('AW-123456789/AbCdEf_12')).toEqual({ conta: 'AW-123456789', enviarPara: 'AW-123456789/AbCdEf_12' })
    expect(conversaoDoAds('  AW-123456789/AbCd  ')).toEqual({ conta: 'AW-123456789', enviarPara: 'AW-123456789/AbCd' })
  })

  it('sem variável usa a conversão da conta da Licita Bela', () => {
    expect(conversaoDoAds('')).toEqual({ conta: 'AW-18564317906', enviarPara: 'AW-18564317906/OqtRCNnTm7odENKFlJRF' })
    expect(conversaoDoAds(undefined)).toEqual({ conta: 'AW-18564317906', enviarPara: 'AW-18564317906/OqtRCNnTm7odENKFlJRF' })
  })

  it('"desligado" ou fora do formato desliga o Google Ads', () => {
    expect(conversaoDoAds('desligado')).toBeNull()
    expect(conversaoDoAds('AW-123456789')).toBeNull()
    expect(conversaoDoAds('G-ZJQHVTXD35')).toBeNull()
    expect(conversaoDoAds('AW-123/x"><script>')).toBeNull()
  })
})
