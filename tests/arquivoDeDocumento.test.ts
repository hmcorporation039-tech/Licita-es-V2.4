import { describe, expect, it } from 'vitest'
import { detectarTipoDeArquivo, limiteDeArmazenamentoPorEmpresa, nomeDeArquivoSeguro } from '../src/lib/arquivoDeDocumento'

describe('detectarTipoDeArquivo', () => {
  it('reconhece PDF, JPEG e PNG pelo conteúdo', () => {
    expect(detectarTipoDeArquivo(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf')
    expect(detectarTipoDeArquivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg')
    expect(detectarTipoDeArquivo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('image/png')
  })

  it('recusa qualquer outra coisa, mesmo com extensão de PDF', () => {
    expect(detectarTipoDeArquivo(Buffer.from('<html><script>alert(1)</script>'))).toBeNull()
    expect(detectarTipoDeArquivo(Buffer.from('PK\u0003\u0004'))).toBeNull()
    expect(detectarTipoDeArquivo(Buffer.alloc(0))).toBeNull()
  })
})

describe('nomeDeArquivoSeguro', () => {
  it('remove acentos, caracteres perigosos e força a extensão do tipo real', () => {
    expect(nomeDeArquivoSeguro('Certidão Negativa (Receita).PDF', 'application/pdf')).toBe('Certidao Negativa Receita.pdf')
    expect(nomeDeArquivoSeguro('../../etc/passwd', 'image/png')).toBe('.. .. etc passwd.png')
    expect(nomeDeArquivoSeguro('cnd"; rm -rf.exe', 'application/pdf')).toBe('cnd rm -rf.pdf')
  })

  it('usa um nome padrão quando não sobra nada', () => {
    expect(nomeDeArquivoSeguro('', 'image/jpeg')).toBe('documento.jpg')
    expect(nomeDeArquivoSeguro(null, 'application/pdf')).toBe('documento.pdf')
  })
})

describe('limiteDeArmazenamentoPorEmpresa', () => {
  it('padrão de 300 MB e aceita ajuste por variável', () => {
    expect(limiteDeArmazenamentoPorEmpresa({})).toBe(300 * 1024 * 1024)
    expect(limiteDeArmazenamentoPorEmpresa({ MAX_ARQUIVOS_MB_EMPRESA: '50' })).toBe(50 * 1024 * 1024)
    expect(limiteDeArmazenamentoPorEmpresa({ MAX_ARQUIVOS_MB_EMPRESA: 'x' })).toBe(300 * 1024 * 1024)
  })
})
