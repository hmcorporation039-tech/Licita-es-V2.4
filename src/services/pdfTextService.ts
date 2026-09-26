// ============================================================
// services/pdfTextService.ts — Extrai texto de um PDF (edital) e
// decide se vale confiar nesse texto.
//
// Editais com camada de texto vão para o modelo como texto puro, que é
// muito mais barato. Editais escaneados (foto de papel, comum em
// prefeitura pequena) não têm camada de texto nenhuma e precisam ir em
// PDF nativo, para o modelo enxergar a página — ver editalAnalysisService.
// ============================================================

import { PDFParse } from 'pdf-parse'

// Uma página de edital com camada de texto passa fácil de mil caracteres.
// Uma página escaneada devolve zero ou um punhado de sujeira.
export const MIN_CARACTERES_POR_PAGINA = 200

export interface PdfTexto {
  texto: string
  paginas: number
}

export function temCamadaDeTexto(texto: string, paginas: number): boolean {
  if (paginas <= 0) return false
  const limpo = texto.replace(/\s/g, '')
  if (limpo.length === 0) return false
  return limpo.length / paginas >= MIN_CARACTERES_POR_PAGINA
}

export async function extractPdf(buffer: Buffer): Promise<PdfTexto> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return { texto: result.text, paginas: result.total }
  } finally {
    await parser.destroy()
  }
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await extractPdf(buffer)).texto
}
