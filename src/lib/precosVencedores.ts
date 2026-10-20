import { EstatisticasDePreco, estatisticasPorUnidade } from './precosDeMercado'
import { formatarDocumentoDoFornecedor } from './documentoDoFornecedor'
import { semRepeticao } from './semRepeticao'
import { normalize } from './geoService'

export const MINIMO_DE_CASOS = 3
export const MESES_DO_HISTORICO = 24
export const SIMILARIDADE_MINIMA = 0.55
export const MAXIMO_POR_DESCRICAO = 40
export const MAXIMO_POR_CODIGO = 300
export const MAXIMO_DE_RECENTES = 10
export const MAXIMO_DE_VENCEDORES = 5
export const DESCONTO_MINIMO = -0.5
export const DESCONTO_MAXIMO = 0.95
const LIMITE_DA_DESCRICAO = 120
const TAMANHO_MINIMO_DA_DESCRICAO = 4

export type CriterioDeSemelhanca = 'codigo' | 'descricao'

export interface CasoVencedor {
  orgao: string | null
  municipio: string | null
  uf: string | null
  dataDoResultado: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  precoUnitario: number
  precoEstimado: number | null
  vencedorNi: string | null
  vencedorNome: string | null
  vencedorPorte: string | null
}

export interface CasoRecente {
  orgao: string | null
  municipio: string | null
  uf: string | null
  dataDoResultado: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  precoVencedor: number
  precoEstimado: number | null
  vencedorNome: string | null
  vencedorPorte: string | null
}

export interface FornecedorQueMaisVence {
  nome: string | null
  porte: string | null
  documento: string | null
  vitorias: number
}

export interface EstatisticasDosVencedores {
  estatisticas: EstatisticasDePreco | null
  unidade: string | null
  unidadeConfere: boolean | null
}

export interface PrecosVencedoresDoItem extends EstatisticasDosVencedores {
  itemId: string
  criterio: CriterioDeSemelhanca | null
  amostras: number
  descontoMedianoPct: number | null
  recentes: CasoRecente[]
  quemMaisVence: FornecedorQueMaisVence[]
}

const arred1 = (n: number) => Math.round(n * 10) / 10

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenado = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenado.length / 2)
  return ordenado.length % 2 === 1 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2
}

function maisRecentePrimeiro(a: CasoVencedor, b: CasoVencedor): number {
  return (b.dataDoResultado ?? '').localeCompare(a.dataDoResultado ?? '')
}

export function estatisticasDosVencedores(casos: CasoVencedor[], unidadeDoItem: string | null | undefined): EstatisticasDosVencedores {
  const validos = casos.filter((c) => Number.isFinite(c.precoUnitario) && c.precoUnitario > 0)
  const porUnidade = estatisticasPorUnidade(validos, unidadeDoItem)
  const suficiente = porUnidade.registros.length >= MINIMO_DE_CASOS
  return { estatisticas: suficiente ? porUnidade.estatisticas : null, unidade: porUnidade.unidade, unidadeConfere: porUnidade.unidadeConfere }
}

export function descontoDoCaso(caso: Pick<CasoVencedor, 'precoUnitario' | 'precoEstimado'>): number | null {
  const { precoUnitario, precoEstimado } = caso
  if (precoEstimado === null || !Number.isFinite(precoEstimado) || precoEstimado <= 0) return null
  if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) return null
  const desconto = 1 - precoUnitario / precoEstimado
  return desconto >= DESCONTO_MINIMO && desconto <= DESCONTO_MAXIMO ? desconto : null
}

export function descontoMedianoPct(casos: Pick<CasoVencedor, 'precoUnitario' | 'precoEstimado'>[]): number | null {
  const descontos = casos.map(descontoDoCaso).filter((d): d is number => d !== null)
  const meio = mediana(descontos)
  return meio === null ? null : arred1(meio * 100)
}

function chaveDoFornecedor(caso: CasoVencedor): string | null {
  const digitos = (caso.vencedorNi ?? '').replace(/\D/g, '')
  if (digitos) return `ni:${digitos}`
  const nome = (caso.vencedorNome ?? '').trim().toLowerCase()
  return nome ? `nome:${nome}` : null
}

export function quemMaisVence(casos: CasoVencedor[], limite = MAXIMO_DE_VENCEDORES): FornecedorQueMaisVence[] {
  const grupos = new Map<string, { fornecedor: FornecedorQueMaisVence; ultima: string }>()
  for (const caso of [...casos].sort(maisRecentePrimeiro)) {
    const chave = chaveDoFornecedor(caso)
    if (!chave) continue
    const grupo = grupos.get(chave)
    if (grupo) {
      grupo.fornecedor.vitorias += 1
      grupo.fornecedor.nome ??= caso.vencedorNome
      grupo.fornecedor.porte ??= caso.vencedorPorte
      continue
    }
    grupos.set(chave, {
      fornecedor: { nome: caso.vencedorNome, porte: caso.vencedorPorte, documento: formatarDocumentoDoFornecedor(caso.vencedorNi), vitorias: 1 },
      ultima: caso.dataDoResultado ?? '',
    })
  }
  return [...grupos.values()]
    .sort((a, b) => b.fornecedor.vitorias - a.fornecedor.vitorias || b.ultima.localeCompare(a.ultima) || (a.fornecedor.nome ?? '').localeCompare(b.fornecedor.nome ?? ''))
    .slice(0, limite)
    .map((g) => g.fornecedor)
}

function descricaoCurta(texto: string): string {
  const limpo = semRepeticao(texto).replace(/\s+/g, ' ').trim()
  return limpo.length > LIMITE_DA_DESCRICAO ? `${limpo.slice(0, LIMITE_DA_DESCRICAO - 1).trimEnd()}…` : limpo
}

export function casosRecentes(casos: CasoVencedor[], limite = MAXIMO_DE_RECENTES): CasoRecente[] {
  return [...casos]
    .sort(maisRecentePrimeiro)
    .slice(0, limite)
    .map((c) => ({
      orgao: c.orgao,
      municipio: c.municipio,
      uf: c.uf,
      dataDoResultado: c.dataDoResultado,
      descricao: descricaoCurta(c.descricao),
      unidade: c.unidade,
      quantidade: c.quantidade,
      precoVencedor: c.precoUnitario,
      precoEstimado: c.precoEstimado,
      vencedorNome: c.vencedorNome,
      vencedorPorte: c.vencedorPorte,
    }))
}

export function precisaBuscarPorDescricao(temCodigo: boolean, casosPorCodigo: number): boolean {
  return !temCodigo || casosPorCodigo < MINIMO_DE_CASOS
}

export interface EscolhaDoCriterio {
  criterio: CriterioDeSemelhanca | null
  casos: CasoVencedor[]
}

export function escolherCriterio(entrada: { temCodigo: boolean; porCodigo: CasoVencedor[]; porDescricao: CasoVencedor[] | null }): EscolhaDoCriterio {
  const porCodigo = entrada.temCodigo ? entrada.porCodigo : []
  if (porCodigo.length >= MINIMO_DE_CASOS) return { criterio: 'codigo', casos: porCodigo }
  const porDescricao = entrada.porDescricao ?? []
  if (porDescricao.length > 0 && porDescricao.length >= porCodigo.length) return { criterio: 'descricao', casos: porDescricao }
  if (porCodigo.length > 0) return { criterio: 'codigo', casos: porCodigo }
  return { criterio: null, casos: [] }
}

export function precosVencedoresDoItem(itemId: string, unidadeDoItem: string | null | undefined, escolha: EscolhaDoCriterio): PrecosVencedoresDoItem {
  const amostras = escolha.casos.length
  if (amostras < MINIMO_DE_CASOS) {
    return { itemId, criterio: escolha.criterio, amostras, estatisticas: null, unidade: null, unidadeConfere: null, descontoMedianoPct: null, recentes: [], quemMaisVence: [] }
  }
  return {
    itemId,
    criterio: escolha.criterio,
    amostras,
    ...estatisticasDosVencedores(escolha.casos, unidadeDoItem),
    descontoMedianoPct: descontoMedianoPct(escolha.casos),
    recentes: casosRecentes(escolha.casos),
    quemMaisVence: quemMaisVence(escolha.casos),
  }
}

export function inicioDoHistorico(agora: Date, meses = MESES_DO_HISTORICO): string {
  const inicio = new Date(agora)
  inicio.setUTCMonth(inicio.getUTCMonth() - meses)
  return inicio.toISOString().slice(0, 10)
}

export function descricaoParaComparar(item: { descricao: string; descricaoNorm: string | null }): string | null {
  const texto = (item.descricaoNorm ?? normalize(item.descricao)).replace(/\s+/g, ' ').trim()
  return texto.length >= TAMANHO_MINIMO_DA_DESCRICAO ? texto : null
}
