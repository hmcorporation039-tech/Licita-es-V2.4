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
  // O mesmo texto com um marcador [[PÁGINA n]] antes de cada página — é o que vai
  // para a IA, para ela poder citar a página de cada exigência.
  textoComPaginas: string
}

// Monta o texto com marcadores de página. Pura: recebe as páginas já extraídas.
export function montarTextoComPaginas(paginas: { num: number; text: string }[]): string {
  return paginas.map((p) => `[[PÁGINA ${p.num}]]\n${p.text.trim()}`).join('\n\n')
}

export function temCamadaDeTexto(texto: string, paginas: number): boolean {
  if (paginas <= 0) return false
  const limpo = texto.replace(/\s/g, '')
  if (limpo.length === 0) return false
  return limpo.length / paginas >= MIN_CARACTERES_POR_PAGINA
}

// PDF patológico (estrutura circular, página gigante) pode travar o parser; o worker não pode ficar preso.
export const LIMITE_DE_TEMPO_DO_PDF_MS = 90_000

export async function extractPdf(buffer: Buffer): Promise<PdfTexto> {
  const parser = new PDFParse({ data: buffer })
  try {
    let timer: NodeJS.Timeout | undefined
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => rejeitar(new Error('Tempo esgotado ao ler o PDF (arquivo muito complexo ou corrompido)')), LIMITE_DE_TEMPO_DO_PDF_MS)
    })
    const result = await Promise.race([parser.getText(), limite]).finally(() => clearTimeout(timer))
    const comMarcadores = result.pages?.length ? montarTextoComPaginas(result.pages) : result.text
    return { texto: result.text, paginas: result.total, textoComPaginas: comMarcadores }
  } finally {
    await parser.destroy()
  }
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await extractPdf(buffer)).texto
}
