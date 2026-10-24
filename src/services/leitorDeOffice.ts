// ============================================================
// services/leitorDeOffice.ts — Extrai TEXTO de planilhas (.xlsx) e documentos
// (.docx) do Office, para a análise de edital ler a planilha de composição e o
// termo de referência mesmo quando não vêm em PDF. Sem dependência nova: .xlsx
// e .docx são ZIP + XML, descompactados com o fflate que já geramos planilha
// (ver lib/planilhaXlsx.ts). Só leitura de texto, não reconstrói formatação.
// ============================================================

import { unzipSync, strFromU8 } from 'fflate'

const MAX_CARACTERES_POR_ARQUIVO = 200_000

export type TipoDeOffice = 'xlsx' | 'docx'

export interface TextoDeOffice {
  tipo: TipoDeOffice
  texto: string
}

function pareceZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodificarXml(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (inteiro, corpo: string) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10)
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteiro
    }
    return ENTIDADES[corpo] ?? inteiro
  })
}

function textoDasTagsT(xml: string): string {
  const partes = xml.match(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)
  if (!partes) return ''
  return partes.map((p) => decodificarXml(p.replace(/<[^>]+>/g, ''))).join('')
}

function stringsCompartilhadas(xml: string | undefined): string[] {
  if (!xml) return []
  const itens = xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)
  if (!itens) return []
  return itens.map((si) => textoDasTagsT(si))
}

function valorDaCelula(celula: string, compartilhadas: string[]): string {
  const tipo = /\st="([^"]+)"/.exec(celula)?.[1]
  if (tipo === 'inlineStr') return textoDasTagsT(celula)
  const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(celula)?.[1]
  if (v == null) return ''
  if (tipo === 's') {
    const indice = Number(v)
    return Number.isInteger(indice) ? compartilhadas[indice] ?? '' : ''
  }
  return decodificarXml(v)
}

function textoDeUmaPlanilha(xml: string, compartilhadas: string[]): string {
  const linhas = xml.match(/<row(?:\s[^>]*)?>[\s\S]*?<\/row>/g) ?? []
  const saida: string[] = []
  for (const linha of linhas) {
    const celulas = linha.match(/<c(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []
    const valores = celulas.map((c) => valorDaCelula(c, compartilhadas).trim()).filter((s) => s !== '')
    if (valores.length > 0) saida.push(valores.join(' | '))
  }
  return saida.join('\n')
}

export function extrairTextoDeXlsx(entradas: Record<string, Uint8Array>): string {
  const compartilhadas = stringsCompartilhadas(entradas['xl/sharedStrings.xml'] ? strFromU8(entradas['xl/sharedStrings.xml']) : undefined)
  const nomesDasAbas = Object.keys(entradas)
    .filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome))
    .sort((a, b) => (Number(a.match(/(\d+)/)?.[1]) || 0) - (Number(b.match(/(\d+)/)?.[1]) || 0))
  const blocos: string[] = []
  for (const nome of nomesDasAbas) {
    const texto = textoDeUmaPlanilha(strFromU8(entradas[nome]), compartilhadas)
    if (texto.trim()) blocos.push(texto)
  }
  return blocos.join('\n\n').slice(0, MAX_CARACTERES_POR_ARQUIVO)
}

export function extrairTextoDeDocx(entradas: Record<string, Uint8Array>): string {
  const doc = entradas['word/document.xml']
  if (!doc) return ''
  const xml = strFromU8(doc)
  const paragrafos = xml.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)
  const texto = paragrafos ? paragrafos.map((p) => textoDasTagsT(p)).join('\n') : textoDasTagsT(xml)
  return texto.replace(/\n{3,}/g, '\n\n').slice(0, MAX_CARACTERES_POR_ARQUIVO)
}

export function extrairTextoDeOffice(buffer: Buffer): TextoDeOffice | null {
  if (!pareceZip(buffer)) return null
  let entradas: Record<string, Uint8Array>
  try {
    entradas = unzipSync(new Uint8Array(buffer))
  } catch {
    return null
  }
  if (entradas['xl/workbook.xml']) {
    const texto = extrairTextoDeXlsx(entradas)
    return texto.trim() ? { tipo: 'xlsx', texto } : null
  }
  if (entradas['word/document.xml']) {
    const texto = extrairTextoDeDocx(entradas)
    return texto.trim() ? { tipo: 'docx', texto } : null
  }
  return null
}
