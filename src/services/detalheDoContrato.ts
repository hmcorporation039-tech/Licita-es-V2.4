// ============================================================
// services/detalheDoContrato.ts — "O que o contrato pede": busca no PNCP os itens
// da compra que gerou o contrato e procura, no edital / termo de referência /
// minuta, a regra de subcontratação (Lei 14.133/2021, art. 122). Sem IA.
//
// Tudo com prazo: a tela nunca espera mais que ~20 s. Se o PNCP demorar, devolve o
// que já chegou (parcial) e guarda por pouco tempo; resultado completo fica 24 h em
// memória (por compra: vários contratos de uma ata compartilham a mesma busca).
// ============================================================

import { unzipSync } from 'fflate'
import { downloadPNCPDocument, isPdf, listPNCPDocuments } from './pncpDocumentsService'
import { fetchPNCPItensBrutos, fetchPNCPResultadosDoItem } from './pncpItemsService'
import { extractPdf, temCamadaDeTexto } from './pdfTextService'
import { extrairTextoDeOffice } from './leitorDeOffice'
import { acharRegraDeSubcontratacao, ordenarParaProcurarARegra, pesoParaProcurarARegra, type RegraDeSubcontratacao, type TextoDeDocumento } from '../lib/subcontratacao'
import { itemDoPncp, valorHomologadoDosResultados, type CompraDoPncp, type ItemDaCompra } from '../lib/itensDoContrato'

export interface BaseDaCompra {
  itens: ItemDaCompra[]
  /** false: a compra tem mais itens do que os que vieram. */
  itensCompletos: boolean
  /** Os itens não vieram (erro ou demora do PNCP). */
  itensFalharam: boolean
  regra: RegraDeSubcontratacao
  documentosLidos: string[]
  /** Não deu para listar ou ler os arquivos da compra. */
  arquivosFalharam: boolean
  /** O prazo acabou antes de terminar. */
  parcial: boolean
}

export const PRAZO_DA_BASE_MS = 15_000
const PRAZO_DOS_HOMOLOGADOS_MS = 4_000
const VALIDADE_MS = 24 * 60 * 60 * 1000
const VALIDADE_DO_PARCIAL_MS = 10 * 60 * 1000
const MAX_NO_CACHE = 300
const MAX_ARQUIVOS = 4
const MAX_ENTRADAS_DO_ZIP = 3
const MAX_BYTES_DESCOMPACTADOS = 60 * 1024 * 1024
const MAX_HOMOLOGADOS = 10

const NAO_ENCONTREI: RegraDeSubcontratacao = { situacao: 'nao_encontrei', trecho: null, limite: null, parcelas: null, documento: null }

const cache = new Map<string, { em: number; validade: number; valor: BaseDaCompra }>()
const emAndamento = new Map<string, Promise<BaseDaCompra>>()
const homologados = new Map<string, { em: number; valor: number | null }>()

/** Testes: esquece o que está guardado. */
export function limparCacheDoDetalhe(): void {
  cache.clear()
  emAndamento.clear()
  homologados.clear()
}

const chave = (c: CompraDoPncp) => `${c.cnpj}-${c.ano}-${c.sequencial}`

function guardar<T>(mapa: Map<string, T>, k: string, v: T) {
  mapa.delete(k)
  mapa.set(k, v)
  while (mapa.size > MAX_NO_CACHE) mapa.delete(mapa.keys().next().value as string)
}

/** Itens e regra de subcontratação da compra, com cache e prazo. */
export async function baseDaCompra(compra: CompraDoPncp, prazoMs = PRAZO_DA_BASE_MS): Promise<BaseDaCompra> {
  const k = chave(compra)
  const guardado = cache.get(k)
  if (guardado && Date.now() - guardado.em < guardado.validade) return guardado.valor
  const andando = emAndamento.get(k)
  if (andando) return andando
  const busca = buscarBase(compra, prazoMs)
    .then((valor) => {
      guardar(cache, k, { em: Date.now(), validade: valor.parcial || valor.itensFalharam || valor.arquivosFalharam ? VALIDADE_DO_PARCIAL_MS : VALIDADE_MS, valor })
      return valor
    })
    .finally(() => emAndamento.delete(k))
  emAndamento.set(k, busca)
  return busca
}

async function buscarBase(compra: CompraDoPncp, prazoMs: number): Promise<BaseDaCompra> {
  const fim = Date.now() + prazoMs
  const cancelar = new AbortController()
  const estado: BaseDaCompra = {
    itens: [],
    itensCompletos: false,
    itensFalharam: false,
    regra: NAO_ENCONTREI,
    documentosLidos: [],
    arquivosFalharam: false,
    parcial: false,
  }
  let itensProntos = false
  let regraPronta = false

  const itens = fetchPNCPItensBrutos(compra.cnpj, compra.ano, compra.sequencial, { timeoutMs: Math.min(10_000, prazoMs), signal: cancelar.signal })
    .then((r) => {
      estado.itens = r.itens.flatMap((b) => itemDoPncp(b) ?? []).sort((a, b) => a.numero - b.numero)
      estado.itensCompletos = r.completo
    })
    .catch((err) => {
      estado.itensFalharam = true
      if (!cancelar.signal.aborted) console.warn('[Detalhe do contrato] Itens do PNCP falharam:', err instanceof Error ? err.message : err)
    })
    .finally(() => {
      itensProntos = true
    })

  const regra = procurarRegra(compra, estado, cancelar.signal, fim)
    .catch((err) => {
      estado.arquivosFalharam = true
      if (!cancelar.signal.aborted) console.warn('[Detalhe do contrato] Arquivos do PNCP falharam:', err instanceof Error ? err.message : err)
    })
    .finally(() => {
      regraPronta = true
    })

  let relogio: NodeJS.Timeout | undefined
  await Promise.race([Promise.all([itens, regra]), new Promise<void>((r) => (relogio = setTimeout(r, Math.max(0, fim - Date.now()))))])
  clearTimeout(relogio)
  if (!itensProntos || !regraPronta) {
    estado.parcial = true
    if (!itensProntos) estado.itensFalharam = true
    cancelar.abort()
  }
  return { ...estado, documentosLidos: [...estado.documentosLidos] }
}

async function procurarRegra(compra: CompraDoPncp, estado: BaseDaCompra, signal: AbortSignal, fim: number): Promise<void> {
  const lista = await listPNCPDocuments(compra.cnpj, compra.ano, compra.sequencial, { timeoutMs: Math.min(8_000, fim - Date.now()), signal })
  // "CE_01626__EDITAL": sublinhado no lugar de espaço. Edital, termo de referência e minuta primeiro.
  const arquivos = ordenarParaProcurarARegra(lista.filter((a) => a.statusAtivo).map((a) => ({ ...a, titulo: a.titulo.replace(/_+/g, ' ').trim() || a.titulo })))
  let falhas = 0
  for (const arquivo of arquivos.slice(0, MAX_ARQUIVOS)) {
    const restante = fim - Date.now()
    if (signal.aborted || restante < 1_500) return
    let buffer: Buffer
    try {
      buffer = await downloadPNCPDocument(arquivo.uri, { timeoutMs: Math.min(12_000, restante), signal })
    } catch {
      falhas++
      continue
    }
    for (const texto of await textosDoArquivo(arquivo.titulo, buffer)) {
      if (signal.aborted) return
      estado.documentosLidos.push(texto.nome)
      const achada = acharRegraDeSubcontratacao([texto])
      if (achada.situacao !== 'nao_encontrei') {
        estado.regra = achada
        return
      }
    }
  }
  if (falhas > 0 && estado.documentosLidos.length === 0) estado.arquivosFalharam = true
}

function pareceZip(b: Buffer | Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

async function textoDoPdf(nome: string, buffer: Buffer): Promise<TextoDeDocumento | null> {
  try {
    const pdf = await extractPdf(buffer)
    // Escaneado (sem camada de texto): não dá para procurar sem IA.
    return temCamadaDeTexto(pdf.texto, pdf.paginas) ? { nome, texto: pdf.texto } : null
  } catch {
    return null
  }
}

/** Texto de um arquivo do PNCP: PDF, .docx, ou um .zip com PDFs/.docx dentro (os mais relevantes primeiro). */
export async function textosDoArquivo(nome: string, buffer: Buffer): Promise<TextoDeDocumento[]> {
  if (isPdf(buffer)) {
    const t = await textoDoPdf(nome, buffer)
    return t ? [t] : []
  }
  if (!pareceZip(buffer)) return []
  const office = extrairTextoDeOffice(buffer)
  if (office) return office.tipo === 'docx' ? [{ nome, texto: office.texto }] : []
  let entradas: Record<string, Uint8Array>
  try {
    let total = 0
    entradas = unzipSync(new Uint8Array(buffer), {
      filter: (f) => {
        if (!/\.(pdf|docx)$/i.test(f.name) || f.originalSize > MAX_BYTES_DESCOMPACTADOS) return false
        total += f.originalSize
        return total <= MAX_BYTES_DESCOMPACTADOS
      },
    })
  } catch {
    return []
  }
  const ordenadas = Object.keys(entradas)
    .map((caminho, ordem) => ({ caminho, ordem, peso: pesoParaProcurarARegra(caminho.split('/').pop() ?? caminho) }))
    .sort((a, b) => b.peso - a.peso || a.ordem - b.ordem)
    .slice(0, MAX_ENTRADAS_DO_ZIP)
  const textos: TextoDeDocumento[] = []
  for (const { caminho } of ordenadas) {
    const conteudo = Buffer.from(entradas[caminho])
    const nomeInterno = `${nome} › ${caminho.split('/').pop()}`
    if (isPdf(conteudo)) {
      const t = await textoDoPdf(nomeInterno, conteudo)
      if (t) textos.push(t)
    } else if (pareceZip(conteudo)) {
      const docx = extrairTextoDeOffice(conteudo)
      if (docx?.tipo === 'docx') textos.push({ nome: nomeInterno, texto: docx.texto })
    }
  }
  return textos
}

/**
 * Valor homologado dos itens pedidos (só os que já têm resultado, no máximo 10),
 * do ganhador deste contrato. Guardado 24 h por contrato e item; o que não vier no prazo fica sem.
 */
export async function homologadosDosItens(
  compra: CompraDoPncp,
  contratoId: string,
  fornecedorNi: string | null,
  itens: ItemDaCompra[],
  prazoMs = PRAZO_DOS_HOMOLOGADOS_MS
): Promise<Map<number, number | null>> {
  const valores = new Map<number, number | null>()
  const faltando: ItemDaCompra[] = []
  for (const item of itens.filter((i) => i.temResultado).slice(0, MAX_HOMOLOGADOS)) {
    const g = homologados.get(`${contratoId}#${item.numero}`)
    if (g && Date.now() - g.em < VALIDADE_MS) valores.set(item.numero, g.valor)
    else faltando.push(item)
  }
  if (faltando.length === 0) return valores
  const cancelar = new AbortController()
  const fila = [...faltando]
  const trabalhador = async () => {
    for (let item = fila.shift(); item; item = fila.shift()) {
      try {
        const resultados = await fetchPNCPResultadosDoItem(compra.cnpj, compra.ano, compra.sequencial, item.numero, { timeoutMs: prazoMs, signal: cancelar.signal })
        const valor = valorHomologadoDosResultados(resultados, fornecedorNi)
        valores.set(item.numero, valor)
        guardar(homologados, `${contratoId}#${item.numero}`, { em: Date.now(), valor })
      } catch {
        // sem o homologado deste item; segue com o estimado
      }
    }
  }
  let relogio: NodeJS.Timeout | undefined
  await Promise.race([Promise.all([trabalhador(), trabalhador(), trabalhador()]), new Promise<void>((r) => (relogio = setTimeout(r, prazoMs)))])
  clearTimeout(relogio)
  cancelar.abort()
  return valores
}
