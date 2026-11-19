import { describe, expect, it } from 'vitest'
import { enderecoDaExtensao } from '../web/src/lib/extensaoBela'

describe('enderecoDaExtensao', () => {
  it('aceita o endereço da Chrome Web Store', () => {
    const url = 'https://chromewebstore.google.com/detail/bela-na-disputa/abcdefghijklmnopabcdefghijklmnop'
    expect(enderecoDaExtensao(url)).toBe(url)
    expect(enderecoDaExtensao('https://chrome.google.com/webstore/detail/abcdefghijklmnopabcdefghijklmnop')).not.toBeNull()
  })

  it('sem endereço ou fora da loja, não mostra o botão', () => {
    expect(enderecoDaExtensao(undefined)).toBeNull()
    expect(enderecoDaExtensao('')).toBeNull()
    expect(enderecoDaExtensao('https://exemplo.com/bela.zip')).toBeNull()
    expect(enderecoDaExtensao('http://chromewebstore.google.com/detail/x')).toBeNull()
    expect(enderecoDaExtensao('https://chromewebstore.google.com.exemplo.com/detail/x')).toBeNull()
  })
})
