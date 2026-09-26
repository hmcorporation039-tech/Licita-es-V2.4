// ============================================================
// lib/coletaWindow.ts — Resolve a janela de datas de uma coleta.
// ============================================================

export const LOOKBACK_PADRAO_DIAS = 2
export const SOBREPOSICAO_CURSOR_DIAS = 1
export const JANELA_MAXIMA_DIAS = 30

const DIA_MS = 24 * 60 * 60 * 1000

export interface ColetaWindow {
  dataInicial: string
  dataFinal: string
}

export interface ColetaWindowPayload {
  dataInicial?: string
  dataFinal?: string
}

export interface ColetaWindowOptions {
  now?: Date
  ultimaPublicacaoColetada?: Date | null
  lookbackDias?: number
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function subtrairDias(date: Date, dias: number): Date {
  return new Date(date.getTime() - dias * DIA_MS)
}

export function resolveColetaWindow(
  payload: ColetaWindowPayload = {},
  options: ColetaWindowOptions = {}
): ColetaWindow {
  if (payload.dataInicial && payload.dataFinal) {
    return { dataInicial: payload.dataInicial, dataFinal: payload.dataFinal }
  }

  const now = options.now ?? new Date()
  const lookbackDias = options.lookbackDias ?? LOOKBACK_PADRAO_DIAS
  const cursor = options.ultimaPublicacaoColetada ?? null

  const limiteAntigo = subtrairDias(now, JANELA_MAXIMA_DIAS)
  const inicioPorLookback = subtrairDias(now, lookbackDias)
  const inicioPorCursor = cursor ? subtrairDias(cursor, SOBREPOSICAO_CURSOR_DIAS) : null

  let inicio = inicioPorCursor ?? inicioPorLookback
  if (inicio.getTime() < limiteAntigo.getTime()) inicio = limiteAntigo
  if (inicio.getTime() > inicioPorLookback.getTime()) inicio = inicioPorLookback

  return {
    dataInicial: payload.dataInicial ?? formatDateOnly(inicio),
    dataFinal: payload.dataFinal ?? formatDateOnly(now),
  }
}
