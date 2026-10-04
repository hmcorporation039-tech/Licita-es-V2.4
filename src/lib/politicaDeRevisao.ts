// ============================================================
// lib/politicaDeRevisao.ts — Decide se a Claude precisa revisar a análise do Gemini.
// Revisar custa tempo e dinheiro (a Claude relê o edital inteiro). No modo "seletiva",
// só revisa quando há sinal de risco; no modo "sempre" (padrão) revisa tudo.
//   CLAUDE_REVIEW_MODE=sempre|seletiva
//   CLAUDE_REVIEW_VALOR_ALTO=1000000   (opcional, R$: acima disso revisa sempre)
// ============================================================

import type { EditalAnalysisResult } from '../services/llm/types'

export type ModoDeRevisao = 'sempre' | 'seletiva'

export function modoDeRevisao(env: NodeJS.ProcessEnv = process.env): ModoDeRevisao {
  return (env.CLAUDE_REVIEW_MODE ?? '').trim().toLowerCase() === 'seletiva' ? 'seletiva' : 'sempre'
}

export function valorAltoDeRevisao(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.CLAUDE_REVIEW_VALOR_ALTO)
  return Number.isFinite(n) && n > 0 ? n : null
}

const AUSENTE = /^\s*(|-|—|n\/?a|n[aã]o\s+(informad|consta|localizad|identificad|h[aá]|especificad|se\s+aplica).*)\s*$/i

export function campoAusente(v: string | undefined): boolean {
  return AUSENTE.test(v ?? '')
}

// "R$ 1.234.567,89" -> 1234567.89 (primeiro valor do texto); null se não houver.
export function valorEmReais(texto: string): number | null {
  const m = texto.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2] : ''))
  return Number.isFinite(n) ? n : null
}

export interface Decisao {
  revisar: boolean
  motivos: string[]
}

export function decidirRevisao(
  analise: Pick<EditalAnalysisResult, 'valorEstimado' | 'dataSessao' | 'criterioJulgamento' | 'matrizExigencias'>,
  verificacoes: { status: string }[],
  modo: ModoDeRevisao,
  limiteValor: number | null = null
): Decisao {
  if (modo === 'sempre') return { revisar: true, motivos: ['modo "sempre"'] }

  const motivos: string[] = []
  if (analise.matrizExigencias.length === 0) motivos.push('nenhuma exigência extraída')

  const naoLocalizadas = verificacoes.filter((v) => v.status === 'nao-localizado').length
  if (verificacoes.length > 0 && (naoLocalizadas >= 3 || naoLocalizadas / verificacoes.length >= 0.2)) {
    motivos.push(`${naoLocalizadas} exigência(s) não localizada(s) literalmente no edital`)
  }
  if (verificacoes.some((v) => v.status === 'nao-verificavel')) motivos.push('há documento escaneado (sem texto para conferir)')

  const ausentes = [analise.valorEstimado, analise.dataSessao, analise.criterioJulgamento].filter(campoAusente).length
  if (ausentes >= 2) motivos.push('campos-chave (valor, sessão, critério) sem informação')

  const valor = limiteValor !== null ? valorEmReais(analise.valorEstimado ?? '') : null
  if (limiteValor !== null && valor !== null && valor >= limiteValor) motivos.push('valor estimado acima do limite de revisão obrigatória')

  return { revisar: motivos.length > 0, motivos }
}
