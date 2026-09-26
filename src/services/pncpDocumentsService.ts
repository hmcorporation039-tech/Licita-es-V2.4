// ============================================================
// services/pncpDocumentsService.ts — Lista e baixa os arquivos
// (edital, anexos, avisos) de uma contratação publicada no PNCP.
// Endpoint público, sem autenticação — descoberto empiricamente em
// 2026-08-10 (não documentado na API de consulta, vive em /api/pncp).
// ============================================================

import axios from 'axios'

export interface PNCPDocumentInfo {
  uri: string
  titulo: string
  sequencialDocumento: number
  tipoDocumentoNome: string
  statusAtivo: boolean
}

// Lista os documentos publicados para uma contratação
export async function listPNCPDocuments(
  cnpj: string,
  anoCompra: number | string,
  sequencialCompra: number | string
): Promise<PNCPDocumentInfo[]> {
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${sequencialCompra}/arquivos`
  const response = await axios.get(url, { timeout: 20_000 })
  return Array.isArray(response.data) ? response.data : []
}

// Baixa o conteúdo binário de um documento (normalmente PDF)
export async function downloadPNCPDocument(uri: string): Promise<Buffer> {
  const response = await axios.get(uri, { responseType: 'arraybuffer', timeout: 60_000 })
  return Buffer.from(response.data)
}

export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
}

// Peças administrativas do processo: existem no PNCP, mas não dizem nada sobre
// como participar. Autorização de abertura, comprovante de publicação e
// solicitação de parecer entram aqui.
const ADMINISTRATIVO =
  /autoriza[çc][ãa]o|comprovante|publica[çc][ãa]o|parecer|despacho|solicita[çc][ãa]o|^dfd$|\bdfd\b|aviso de licita/i

const EDITAL = /\bedital\b/i
const TERMO_DE_REFERENCIA = /termo\s*de\s*refer|projeto\s*b[aá]sico|\btr\b/i
const APOIO = /anexo|habilita|planilha|or[cç]ament|minuta|contrato/i

// Quanto mais alto, mais cedo o documento entra na análise.
//
// A classificação olha o TÍTULO primeiro, não o tipoDocumentoNome: na prática
// o órgão carimba "Edital" no tipo de quase tudo que anexa ao processo, então
// classificar por tipo empurrava o Termo de Referência — que é onde ficam as
// exigências técnicas reais — para fora do corte, atrás de comprovante de
// publicação e solicitação de parecer.
function prioridade(doc: PNCPDocumentInfo): number {
  const titulo = doc.titulo ?? ''
  const tipo = doc.tipoDocumentoNome ?? ''

  if (ADMINISTRATIVO.test(titulo)) return 0
  if (EDITAL.test(titulo)) return 5
  if (TERMO_DE_REFERENCIA.test(titulo) || TERMO_DE_REFERENCIA.test(tipo)) return 4
  if (APOIO.test(titulo)) return 3
  if (EDITAL.test(tipo)) return 2
  return 1
}

// Escolhe o conjunto documental a analisar, do mais relevante para o menos.
export function selecionarDocumentos(docs: PNCPDocumentInfo[]): PNCPDocumentInfo[] {
  return docs
    .filter((d) => d.statusAtivo)
    .map((doc, ordem) => ({ doc, ordem, peso: prioridade(doc) }))
    .sort((a, b) => b.peso - a.peso || a.ordem - b.ordem)
    .map(({ doc }) => doc)
}

// Compatibilidade com quem só precisa do documento principal.
export function pickMainDocument(docs: PNCPDocumentInfo[]): PNCPDocumentInfo | undefined {
  return selecionarDocumentos(docs)[0]
}
