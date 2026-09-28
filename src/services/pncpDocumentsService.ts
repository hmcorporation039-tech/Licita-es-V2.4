// ============================================================
// services/pncpDocumentsService.ts — Lista e baixa os arquivos
// (edital, anexos, avisos) de uma contratação publicada no PNCP.
// Endpoint público, sem autenticação — descoberto empiricamente em
// 2026-08-10 (não documentado na API de consulta, vive em /api/pncp).
// ============================================================

import axios from 'axios'
import { ordenarPorPrioridade } from '../lib/documentPriority'

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

// Baixa o conteúdo binário de um documento (normalmente PDF) — apesar do
// nome, hoje serve qualquer fonte (Novacap, SESC GO), não só PNCP (ver
// editalAnalysisService.ts). User-Agent de navegador: alguns sites bloqueiam
// cliente sem cara de browser mesmo em arquivo público sem login.
export async function downloadPNCPDocument(uri: string): Promise<Buffer> {
  const response = await axios.get(uri, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  })
  return Buffer.from(response.data)
}

export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
}

// Escolhe o conjunto documental a analisar, do mais relevante para o menos.
// A heurística de prioridade é genérica (ver lib/documentPriority.ts) —
// aqui só filtra pelo que é específico do PNCP (statusAtivo).
export function selecionarDocumentos(docs: PNCPDocumentInfo[]): PNCPDocumentInfo[] {
  return ordenarPorPrioridade(docs.filter((d) => d.statusAtivo))
}

// Compatibilidade com quem só precisa do documento principal.
export function pickMainDocument(docs: PNCPDocumentInfo[]): PNCPDocumentInfo | undefined {
  return selecionarDocumentos(docs)[0]
}
