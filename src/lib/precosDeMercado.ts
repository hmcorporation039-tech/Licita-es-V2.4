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

const SINONIMOS_DE_UNIDADE: Record<string, string> = {
  UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN', UNI: 'UN', UNIT: 'UN', PC: 'UN', PCA: 'UN', PECA: 'UN', PECAS: 'UN',
  CX: 'CX', CXA: 'CX', CAIXA: 'CX', CAIXAS: 'CX',
  PCT: 'PCT', PACOTE: 'PCT', PACOTES: 'PCT',
  KG: 'KG', QUILO: 'KG', QUILOS: 'KG', QUILOGRAMA: 'KG', QUILOGRAMAS: 'KG', KILO: 'KG', KILOGRAMA: 'KG',
  G: 'G', GR: 'G', GRAMA: 'G', GRAMAS: 'G',
  L: 'L', LT: 'L', LTS: 'L', LITRO: 'L', LITROS: 'L',
  ML: 'ML', MILILITRO: 'ML', MILILITROS: 'ML',
  M: 'M', MT: 'M', MTS: 'M', METRO: 'M', METROS: 'M', METROLINEAR: 'M',
  M2: 'M2', 'M²': 'M2', METROQUADRADO: 'M2', METROSQUADRADOS: 'M2',
  M3: 'M3', 'M³': 'M3', METROCUBICO: 'M3', METROSCUBICOS: 'M3',
  PAR: 'PAR', PARES: 'PAR',
  DZ: 'DZ', DUZIA: 'DZ', DUZIAS: 'DZ',
  RS: 'RESMA', RESMA: 'RESMA', RESMAS: 'RESMA',
  RL: 'ROLO', ROLO: 'ROLO', ROLOS: 'ROLO',
  FR: 'FRASCO', FRASCO: 'FRASCO', FRASCOS: 'FRASCO',
  GL: 'GALAO', GALAO: 'GALAO', GALOES: 'GALAO',
  SC: 'SACO', SACO: 'SACO', SACOS: 'SACO',
  TB: 'TUBO', TUBO: 'TUBO', TUBOS: 'TUBO',
  CJ: 'CJ', CONJ: 'CJ', CONJUNTO: 'CJ', CONJUNTOS: 'CJ',
  KIT: 'KIT', KITS: 'KIT',
  H: 'H', HR: 'H', HORA: 'H', HORAS: 'H',
  MES: 'MES', MESES: 'MES',
  DIA: 'DIA', DIAS: 'DIA',
  SV: 'SERVICO', SERV: 'SERVICO', SERVICO: 'SERVICO', SERVICOS: 'SERVICO',
}

export function normalizarUnidade(unidade: string | null | undefined): string | null {
  if (!unidade) return null
  const limpa = unidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
  if (!limpa) return null
  const primeira = limpa.split(/[\s/.,;:()-]+/).filter(Boolean)[0] ?? limpa
  const junta = limpa.replace(/[^A-Z0-9²³]/g, '')
  return SINONIMOS_DE_UNIDADE[junta] ?? SINONIMOS_DE_UNIDADE[primeira] ?? primeira
}

export interface GrupoDeUnidade {
  unidade: string | null
  amostras: number
}

export interface PrecoComUnidade {
  precoUnitario: number
  unidade: string | null
}

export interface PrecosPorUnidade<T extends PrecoComUnidade = RegistroDePreco> {
  estatisticas: EstatisticasDePreco | null
  unidade: string | null
  unidadeConfere: boolean | null
  unidades: GrupoDeUnidade[]
  registros: T[]
}

export function estatisticasPorUnidade<T extends PrecoComUnidade = RegistroDePreco>(registros: T[], unidadeDoItem: string | null | undefined): PrecosPorUnidade<T> {
  const grupos = new Map<string | null, T[]>()
  for (const r of registros) {
    const chave = normalizarUnidade(r.unidade)
    grupos.set(chave, [...(grupos.get(chave) ?? []), r])
  }
  const unidades = [...grupos.entries()].map(([unidade, lista]) => ({ unidade, amostras: lista.length })).sort((a, b) => b.amostras - a.amostras)
  if (unidades.length === 0) return { estatisticas: null, unidade: null, unidadeConfere: null, unidades, registros: [] }
  const doItem = normalizarUnidade(unidadeDoItem)
  const compativel = doItem !== null && grupos.has(doItem) ? doItem : null
  const escolhida = compativel ?? unidades[0].unidade
  const doGrupo = grupos.get(escolhida) ?? []
  return {
    estatisticas: estatisticasDePrecos(doGrupo.map((r) => r.precoUnitario)),
    unidade: escolhida,
    unidadeConfere: compativel !== null ? true : doItem === null || escolhida === null ? null : false,
    unidades,
    registros: doGrupo,
  }
}
