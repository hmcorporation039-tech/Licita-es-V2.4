import { describe, expect, it } from 'vitest'
import { textoDoAvisoDoCadastro } from '../src/lib/avisoDoCadastro'

describe('textoDoAvisoDoCadastro', () => {
  it('explica o domínio não autorizado (110200) e como corrigir', () => {
    const { assunto, texto } = textoDoAvisoDoCadastro('110200', 'www.licitabela.com.br/cadastro')
    expect(assunto).toContain('110200')
    expect(texto).toContain('domínio do site não está autorizado')
    expect(texto).toContain('www.licitabela.com.br/cadastro')
  })

  it('explica chave errada', () => {
    expect(textoDoAvisoDoCadastro('110100', 'x').texto).toContain('chave do captcha')
    expect(textoDoAvisoDoCadastro('400020', 'x').texto).toContain('chave do captcha')
  })

  it('trata desconfiança do navegador como caso isolado', () => {
    expect(textoDoAvisoDoCadastro('600010', 'x').texto).toContain('caso isolado')
  })

  it('código vazio ou desconhecido ainda gera aviso', () => {
    const { assunto, texto } = textoDoAvisoDoCadastro('', '')
    expect(assunto).toContain('sem código')
    expect(texto).toContain('janela anônima')
    expect(texto).toContain('desconhecido')
  })
})
