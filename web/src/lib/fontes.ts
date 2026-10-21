export const ROTULOS_DE_FONTE: Record<string, string> = {
  QUERIDO_DIARIO: 'Diário oficial (Querido Diário)',
  SISTEMA_S: 'Sistema S (SENAI/SESI/SENAC)',
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diários municipais (associações)',
  TCE_CE: 'TCE-CE (municípios do Ceará)',
  TCE_PI: 'TCE-PI (municípios do Piauí)',
  TCE_TO: 'TCE-TO (municípios do Tocantins)',
  TCE_RS: 'TCE-RS (municípios do RS)',
  FAMEM: 'FAMEM (municípios do Maranhão)',
}

export function fontesComLicitacaoAberta(fontesNaApi: number | null | undefined, fontesNaFaixa: number): number | null {
  if (typeof fontesNaApi !== 'number' || !Number.isFinite(fontesNaApi) || fontesNaApi < 1) return null
  return Math.min(Math.floor(fontesNaApi), fontesNaFaixa)
}

export function fontesNaFaixa<T extends { nome: string }>(fontes: T[], marcasComLicitacao: unknown): T[] {
  if (!Array.isArray(marcasComLicitacao) || marcasComLicitacao.length === 0) return fontes
  const presentes = new Set(marcasComLicitacao.filter((m): m is string => typeof m === 'string'))
  const filtradas = fontes.filter((f) => presentes.has(f.nome))
  return filtradas.length > 0 ? filtradas : fontes
}

const MAXIMO_DE_PLATAFORMAS_NA_FAIXA = 8
const NOME_LONGO_DEMAIS_NA_FAIXA = 28

const numeroBr = (valor: number) => valor.toLocaleString('pt-BR')

function contagemValida(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 1) return null
  return Math.floor(valor)
}

export function maisDe(valor: unknown): string | null {
  const n = contagemValida(valor)
  if (n === null) return null
  if (n <= 100) return numeroBr(n)
  return `mais de ${numeroBr(Math.floor((n - 1) / 100) * 100)}`
}

export function alcanceNoHeroi(orgaos: unknown, municipios: unknown): string | null {
  const textoDosOrgaos = maisDe(orgaos)
  if (!textoDosOrgaos) return null
  const orgaosPorExtenso = `${textoDosOrgaos} ${contagemValida(orgaos) === 1 ? 'órgão público' : 'órgãos públicos'}`
  const nDeMunicipios = contagemValida(municipios)
  if (!nDeMunicipios) return `de ${orgaosPorExtenso}`
  return `de ${orgaosPorExtenso} em ${numeroBr(nDeMunicipios)} ${nDeMunicipios === 1 ? 'município' : 'municípios'}`
}

function nomeCabeNaFaixa(nome: unknown): nome is string {
  if (typeof nome !== 'string') return false
  const limpo = nome.trim()
  if (limpo.length === 0 || limpo.length > NOME_LONGO_DEMAIS_NA_FAIXA) return false
  return !(limpo.includes(' ') && limpo === limpo.toUpperCase())
}

export function plataformasNaFaixa(plataformas: unknown, principais: unknown): { total: number; nomes: string[] } | null {
  const total = contagemValida(plataformas)
  if (!total) return null
  const nomes = (Array.isArray(principais) ? principais : []).filter(nomeCabeNaFaixa).map((nome) => nome.trim()).slice(0, MAXIMO_DE_PLATAFORMAS_NA_FAIXA)
  return { total, nomes }
}
