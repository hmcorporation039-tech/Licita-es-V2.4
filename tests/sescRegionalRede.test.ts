import { describe, expect, it } from 'vitest'
import { mesmoDominio, redirectPermitido } from '../src/workers/coletorSescRegional'

describe('redirectPermitido', () => {
  const origem = 'https://www.sescmg.com.br/licitacoes'

  it('aceita redirect no mesmo host, com ou sem www', () => {
    expect(redirectPermitido(origem, { protocol: 'https:', hostname: 'sescmg.com.br' })).toBe(true)
    expect(redirectPermitido(origem, { protocol: 'https:', hostname: 'www.sescmg.com.br' })).toBe(true)
  })

  it('recusa redirect para outro host ou IP interno', () => {
    expect(redirectPermitido(origem, { protocol: 'https:', hostname: 'evil.com' })).toBe(false)
    expect(redirectPermitido(origem, { protocol: 'http:', hostname: '169.254.169.254' })).toBe(false)
    expect(redirectPermitido(origem, { protocol: 'https:', hostname: 'sescmg.com.br.evil.com' })).toBe(false)
  })

  it('recusa rebaixamento de https para http', () => {
    expect(redirectPermitido(origem, { protocol: 'http:', hostname: 'sescmg.com.br' })).toBe(false)
  })

  it('aceita o redirect conhecido do Google Sheets para googleusercontent', () => {
    const planilha = 'https://docs.google.com/spreadsheets/d/x/export?format=csv'
    expect(redirectPermitido(planilha, { protocol: 'https:', hostname: 'doc-0s-4c-sheets.googleusercontent.com' })).toBe(true)
    expect(redirectPermitido(planilha, { protocol: 'https:', hostname: 'googleusercontent.com.evil.com' })).toBe(false)
  })
})

describe('mesmoDominio', () => {
  it('exige mesmo host, protocolo e porta para seguir a paginação', () => {
    expect(mesmoDominio('https://sescsc.com.br/p/2', 'https://www.sescsc.com.br/p/1')).toBe(true)
    expect(mesmoDominio('http://sescsc.com.br/p/2', 'https://sescsc.com.br/p/1')).toBe(false)
    expect(mesmoDominio('https://sescsc.com.br:6379/p/2', 'https://sescsc.com.br/p/1')).toBe(false)
    expect(mesmoDominio('https://outro.com.br/p/2', 'https://sescsc.com.br/p/1')).toBe(false)
  })
})
