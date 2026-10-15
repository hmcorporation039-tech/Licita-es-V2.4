import { inflateSync } from 'node:zlib'
import PDFDocument from 'pdfkit'
import type { Proponente } from '../../lib/documentosDaLicitacao/modelo'

const MAX_LADO = 4000
const MAX_PIXELS = 12_000_000
const CANAIS_POR_TIPO_DE_COR: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const PROFUNDIDADES_POR_TIPO_DE_COR: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pngIntegro(img: Buffer, d: Dimensoes): boolean {
  if (img.length < 33 || !img.subarray(0, 8).equals(ASSINATURA_PNG) || img.toString('latin1', 12, 16) !== 'IHDR') return false
  const profundidade = img[24]
  const tipoDeCor = img[25]
  const entrelacado = img[28]
  const canais = CANAIS_POR_TIPO_DE_COR[tipoDeCor]
  if (!canais || !PROFUNDIDADES_POR_TIPO_DE_COR[tipoDeCor].includes(profundidade) || img[26] !== 0 || img[27] !== 0 || entrelacado !== 0) return false

  const idat: Buffer[] = []
  let temPaleta = false
  let terminou = false
  let i = 8
  while (i + 12 <= img.length) {
    const tamanho = img.readUInt32BE(i)
    const tipo = img.toString('latin1', i + 4, i + 8)
    const fim = i + 12 + tamanho
    if (fim > img.length) return false
    if (tipo === 'IDAT') idat.push(img.subarray(i + 8, i + 8 + tamanho))
    if (tipo === 'PLTE') temPaleta = tamanho > 0 && tamanho % 3 === 0
    i = fim
    if (tipo === 'IEND') {
      terminou = true
      break
    }
  }
  if (!terminou || idat.length === 0 || (tipoDeCor === 3 && !temPaleta)) return false

  const bytesPorLinha = Math.ceil((d.largura * canais * profundidade) / 8) + 1
  const esperado = bytesPorLinha * d.altura
  let pixels: Buffer
  try {
    pixels = inflateSync(Buffer.concat(idat), { maxOutputLength: esperado })
  } catch {
    return false
  }
  if (pixels.length !== esperado) return false
  for (let linha = 0; linha < pixels.length; linha += bytesPorLinha) {
    if (pixels[linha] > 4) return false
  }
  return true
}

function jpegLegivel(img: Buffer): boolean {
  try {
    new PDFDocument({ size: [10, 10], margin: 0 }).image(img, 0, 0, { width: 1 })
    return true
  } catch {
    return false
  }
}

export function imagemLegivel(conteudo: Buffer): boolean {
  const d = dimensoesDaImagem(conteudo)
  if (!d || d.largura < 1 || d.altura < 1 || d.largura > MAX_LADO || d.altura > MAX_LADO || d.largura * d.altura > MAX_PIXELS) return false
  if (conteudo[0] === 0x89) return pngIntegro(conteudo, d)
  return jpegLegivel(conteudo)
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
