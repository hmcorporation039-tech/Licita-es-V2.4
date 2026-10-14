import PDFDocument from 'pdfkit'
import type { Proponente } from '../../lib/documentosDaLicitacao/modelo'

export function imagemLegivel(conteudo: Buffer): boolean {
  try {
    const teste = new PDFDocument({ size: [10, 10], margin: 0 })
    teste.image(conteudo, 0, 0, { width: 1 })
    return dimensoesDaImagem(conteudo) !== null
  } catch {
    return false
  }
}

export interface LogoDoTimbrado {
  conteudo: Buffer
  mimeType: 'image/png' | 'image/jpeg'
}

export interface Timbrado {
  proponente: Proponente
  logo: LogoDoTimbrado | null
}

export interface Dimensoes {
  largura: number
  altura: number
}

export function dimensoesDaImagem(img: Buffer): Dimensoes | null {
  if (img.length >= 24 && img[0] === 0x89 && img[1] === 0x50) {
    return { largura: img.readUInt32BE(16), altura: img.readUInt32BE(20) }
  }
  if (img.length >= 4 && img[0] === 0xff && img[1] === 0xd8) {
    let i = 2
    while (i + 9 < img.length) {
      if (img[i] !== 0xff) {
        i += 1
        continue
      }
      const marcador = img[i + 1]
      const tamanho = img.readUInt16BE(i + 2)
      const ehSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)
      if (ehSof) return { altura: img.readUInt16BE(i + 5), largura: img.readUInt16BE(i + 7) }
      i += 2 + tamanho
    }
  }
  return null
}

export function encaixar(d: Dimensoes, maxLargura: number, maxAltura: number): Dimensoes {
  const escala = Math.min(maxLargura / d.largura, maxAltura / d.altura, 1)
  return { largura: Math.max(1, Math.round(d.largura * escala)), altura: Math.max(1, Math.round(d.altura * escala)) }
}

export function linhasDoRodape(p: Proponente): string[] {
  const contato = [p.telefone && `Telefone: ${p.telefone}`, p.email && `E-mail: ${p.email}`].filter(Boolean).join('   ·   ')
  return [`${p.razaoSocial}   ·   ${p.documento}`, p.endereco, contato].filter(Boolean)
}

export function linhasDaAssinatura(p: Proponente): string[] {
  return [p.responsavel, p.responsavelCargo, `CPF nº ${p.responsavelCpf}`]
}
