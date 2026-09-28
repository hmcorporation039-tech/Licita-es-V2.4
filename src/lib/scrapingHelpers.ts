// ============================================================
// lib/scrapingHelpers.ts — Conversões comuns aos parsers de HTML (Etapa 5:
// Novacap, FIEG, SESC GO). Os dois formatos brasileiros que aparecem nos
// três sites: data "dd/mm/aaaa[ HH:mm]" e valor "R$ 1.234,56".
// ============================================================

// "02/10/2026 14:00" ou "02/10/2026" -> Date. undefined se não casar o formato
// (texto vazio, "-", etc. — mais comum do que se espera nesses sites).
export function parseDataBr(texto: string | null | undefined): Date | undefined {
  if (!texto) return undefined
  const m = texto.trim().match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  if (!m) return undefined
  const [, dia, mes, ano, hora, min] = m
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora ?? 0), Number(min ?? 0))
  return Number.isNaN(data.getTime()) ? undefined : data
}

// "R$ 35.524.053,95" -> 35524053.95. undefined se não houver número.
export function parseValorBr(texto: string | null | undefined): number | undefined {
  if (!texto) return undefined
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return undefined
  const valor = Number(limpo)
  return Number.isNaN(valor) ? undefined : valor
}
