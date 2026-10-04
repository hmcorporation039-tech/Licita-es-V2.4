// ============================================================
// lib/matrizExigencias.ts — Rastreabilidade da matriz de exigências.
//
// A IA transcreve cada exigência do edital. Modelos de linguagem podem inventar
// ou parafrasear, então o SISTEMA confere, por código e sem IA, se o texto
// aparece de fato no documento e em que página:
//
//   confirmado       o texto está no documento (ignorando acento, caixa, pontuação e espaços)
//   parcial          a maior parte das palavras está, na ordem: provável paráfrase, confira
//   nao-localizado   não encontrado no texto: pode ser invenção, confira antes de confiar
//   nao-verificavel  documento escaneado (sem texto) ou trecho curto demais para conferir
//
// Regra pura, sem banco nem I/O.
// ============================================================

import { createHash } from 'node:crypto'
import { normalize } from './geoService'
import type { ExigenciaDoEdital } from '../services/llm/types'

export type StatusDaVerificacao = 'confirmado' | 'parcial' | 'nao-localizado' | 'nao-verificavel'

export interface VerificacaoDaExigencia {
  status: StatusDaVerificacao
  // Página em que o texto foi de fato encontrado (pode diferir da que a IA disse).
  paginaConfirmada: string | null
  documentoConfirmado: string | null
}

export type ExigenciaVerificada = ExigenciaDoEdital & { verificacao: VerificacaoDaExigencia }

export interface DocumentoParaVerificar {
  nome: string
  // null = documento escaneado, enviado como PDF: não há texto para conferir.
  texto: string | null
}

const MIN_CARACTERES_VERIFICAVEIS = 20
const TAMANHO_DO_SHINGLE = 12
const LIMIAR_PARCIAL = 0.4
const MARCADOR_DE_PAGINA = /\[\[PÁGINA\s+(\d+)\]\]/gi

// Chave estável da exigência (entre reanálises): hash do texto normalizado.
export function chaveDaExigencia(texto: string): string {
  return createHash('sha1').update(simplificar(texto)).digest('hex').slice(0, 12)
}

// Minúsculas, sem acento, pontuação virando espaço e espaços colapsados.
export function simplificar(texto: string): string {
  return normalize(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function semReticencias(texto: string): string {
  return texto.replace(/(\.{3}|…)\s*$/, '').trim()
}

// Forma de COMPARAÇÃO: simplificada, sem espaços e sem ligaturas. Extratores de PDF
// perdem glifos de ligatura (num edital real saiu "administra vo" e "compa vel", sem
// o "ti"), e a IA, que lê esse mesmo texto, costuma devolver a palavra correta. Tirar os
// espaços e os pares de ligatura dos DOIS lados faz as duas formas coincidirem.
const LIGATURAS = /ti|tt|ft|fi|fl|ff/g

export function comprimir(texto: string): string {
  return simplificar(texto).replace(/ /g, '').replace(LIGATURAS, '')
}

interface DocumentoPreparado {
  nome: string
  // texto inteiro na forma de comparação (sem marcadores de página)
  comp: string
  // posição (em `comp`) onde começa cada página
  paginas: { inicio: number; numero: string }[]
}

function preparar(doc: DocumentoParaVerificar): DocumentoPreparado | null {
  if (doc.texto === null) return null
  const paginas: { inicio: number; numero: string }[] = []
  let comp = ''
  let ultimo = 0
  const texto = doc.texto
  for (const m of texto.matchAll(MARCADOR_DE_PAGINA)) {
    comp += comprimir(texto.slice(ultimo, m.index))
    paginas.push({ inicio: comp.length, numero: m[1] })
    ultimo = (m.index ?? 0) + m[0].length
  }
  comp += comprimir(texto.slice(ultimo))
  return { nome: doc.nome, comp, paginas }
}

function paginaDaPosicao(doc: DocumentoPreparado, posicao: number): string | null {
  let achada: string | null = null
  for (const p of doc.paginas) {
    if (p.inicio <= posicao) achada = p.numero
    else break
  }
  return achada
}

// Fração dos trechos de TAMANHO_DO_SHINGLE caracteres do alvo que existem no documento.
// Robusto a espaços e ligaturas (usa a forma de comparação).
function fracaoDeShingles(alvo: string, doc: string): number {
  if (alvo.length < TAMANHO_DO_SHINGLE) return 0
  let total = 0
  let achados = 0
  for (let i = 0; i + TAMANHO_DO_SHINGLE <= alvo.length; i++) {
    total++
    if (doc.includes(alvo.slice(i, i + TAMANHO_DO_SHINGLE))) achados++
  }
  return total === 0 ? 0 : achados / total
}

export function verificarExigencias(matriz: ExigenciaDoEdital[], documentos: DocumentoParaVerificar[]): ExigenciaVerificada[] {
  const preparados = documentos.map(preparar)
  const comTexto = preparados.filter((d): d is DocumentoPreparado => d !== null)

  return matriz.map((exigencia) => {
    const alvo = comprimir(semReticencias(exigencia.texto))
    const naoVerificavel = (): ExigenciaVerificada => ({
      ...exigencia,
      verificacao: { status: 'nao-verificavel', paginaConfirmada: null, documentoConfirmado: null },
    })

    if (alvo.length < MIN_CARACTERES_VERIFICAVEIS) return naoVerificavel()
    // Se TODOS os documentos são escaneados, nada a conferir.
    if (comTexto.length === 0) return naoVerificavel()

    // Procura primeiro no documento que a IA indicou; depois nos demais.
    const indicado = simplificar(exigencia.documento)
    const ordenados = [...comTexto].sort((a, b) => {
      const pa = indicado && simplificar(a.nome).includes(indicado) ? 0 : 1
      const pb = indicado && simplificar(b.nome).includes(indicado) ? 0 : 1
      return pa - pb
    })

    for (const doc of ordenados) {
      const pos = doc.comp.indexOf(alvo)
      if (pos >= 0) {
        return {
          ...exigencia,
          verificacao: { status: 'confirmado', paginaConfirmada: paginaDaPosicao(doc, pos), documentoConfirmado: doc.nome },
        }
      }
    }

    let melhor: { fracao: number; doc: DocumentoPreparado } | null = null
    for (const doc of ordenados) {
      const fracao = fracaoDeShingles(alvo, doc.comp)
      if (!melhor || fracao > melhor.fracao) melhor = { fracao, doc }
    }
    if (melhor && melhor.fracao >= LIMIAR_PARCIAL) {
      return { ...exigencia, verificacao: { status: 'parcial', paginaConfirmada: null, documentoConfirmado: melhor.doc.nome } }
    }

    // Há documentos escaneados que não puderam ser conferidos? Então "não localizado" seria injusto.
    const haEscaneado = preparados.some((d) => d === null)
    return {
      ...exigencia,
      verificacao: { status: haEscaneado ? 'nao-verificavel' : 'nao-localizado', paginaConfirmada: null, documentoConfirmado: null },
    }
  })
}

export function resumoDaVerificacao(itens: ExigenciaVerificada[]): Record<StatusDaVerificacao, number> {
  const r: Record<StatusDaVerificacao, number> = { confirmado: 0, parcial: 0, 'nao-localizado': 0, 'nao-verificavel': 0 }
  for (const i of itens) r[i.verificacao.status]++
  return r
}
