// ============================================================
// lib/precosDeMercado.ts — Estatísticas dos preços que o governo PAGOU por um item de
// catálogo (API de Pesquisa de Preços do Compras.gov.br). Sem rede: ver
// services/pesquisaDePrecosService.ts.
// ============================================================

export interface RegistroDePreco {
  precoUnitario: number
  quantidade: number | null
  data: string | null
  orgao: string | null
  uf: string | null
  fornecedor: string | null
  unidade: string | null
}

type Bruto = Record<string, unknown>
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function normalizarRegistroDePreco(bruto: unknown): RegistroDePreco | null {
  if (!bruto || typeof bruto !== 'object') return null
  const r = bruto as Bruto
  const preco = Number(r.precoUnitario)
  if (!Number.isFinite(preco) || preco <= 0) return null
  const qtd = Number(r.quantidade)
  return {
    precoUnitario: preco,
    quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : null,
    data: txt(r.dataResultado)?.slice(0, 10) ?? txt(r.dataCompra)?.slice(0, 10) ?? null,
    orgao: txt(r.nomeOrgao) ?? txt(r.nomeUasg),
    uf: txt(r.estado),
    fornecedor: txt(r.nomeFornecedor),
    unidade: txt(r.siglaUnidadeFornecimento) ?? txt(r.siglaUnidadeMedida),
  }
}

function percentil(ordenado: number[], p: number): number {
  if (ordenado.length === 1) return ordenado[0]
  const pos = (ordenado.length - 1) * p
  const base = Math.floor(pos)
  const resto = pos - base
  return ordenado[base] + (ordenado[Math.min(base + 1, ordenado.length - 1)] - ordenado[base]) * resto
}

export interface EstatisticasDePreco {
  /** Compras usadas no cálculo (depois de descartar valores absurdos). */
  amostras: number
  descartados: number
  minimo: number
  p25: number
  mediana: number
  p75: number
  maximo: number
  media: number
}

const arred = (n: number) => Math.round(n * 100) / 100

// Descarta valores absurdos (erro de digitação no cadastro do órgão, ex.: câmera a R$ 1,3 milhão)
// pelo critério de Tukey com folga ampla (3 x IQR) — só com amostra suficiente para isso.
export function estatisticasDePrecos(precos: number[]): EstatisticasDePreco | null {
  const validos = precos.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b)
  if (validos.length === 0) return null
  let usados = validos
  if (validos.length >= 8) {
    const q1 = percentil(validos, 0.25)
    const q3 = percentil(validos, 0.75)
    const iqr = q3 - q1
    usados = validos.filter((p) => p >= q1 - 3 * iqr && p <= q3 + 3 * iqr)
  }
  return {
    amostras: usados.length,
    descartados: validos.length - usados.length,
    minimo: arred(usados[0]),
    p25: arred(percentil(usados, 0.25)),
    mediana: arred(percentil(usados, 0.5)),
    p75: arred(percentil(usados, 0.75)),
    maximo: arred(usados[usados.length - 1]),
    media: arred(usados.reduce((s, p) => s + p, 0) / usados.length),
  }
}
