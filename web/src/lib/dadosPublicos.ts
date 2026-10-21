import { API_URL } from './api'
import type { Limites } from './adminTypes'
import { dataDaLicitacao, instanteDoPrazo } from './datas'

export interface PlanoPublico {
  codigo: string
  nome: string
  descricao: string | null
  limites: Limites
  precoMensalCentavos: number | null
  precoAnualCentavos?: number | null
}

export interface PlanosResposta {
  trialDias: number
  planos: PlanoPublico[]
}

export interface EstatisticasPublicas {
  abertas: number
  municipios?: number
  estados?: number
  fontes: number
  marcas?: string[]
  orgaos?: number
  plataformas?: number
  principaisPlataformas?: string[]
  atualizadoEm: string | null
}

export interface AmostraDaVitrine {
  objeto: string
  orgao: string
  local: string
  prazo: string | null
  fonte: string
}

export interface RespostaDaVitrine {
  total: number
  amostras: AmostraDaVitrine[]
}

export interface ListaChegando {
  itens: AmostraDaVitrine[]
  ilustrativo: boolean
}

export interface DadosDaEntrada {
  estatisticas: EstatisticasPublicas | null
  planos: PlanosResposta | null
  chegando: ListaChegando
  totaisPorTermo: Record<string, number | null>
  primeiroPrazoPorTermo: Record<string, string | null>
}

const DEZ_MINUTOS_EM_SEGUNDOS = 600
const ESPERA_DAS_ESTATISTICAS_MS = 15000
const ESPERA_DOS_PLANOS_MS = 5000
const ESPERA_DA_VITRINE_MS = 8000
const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const FOLGA_MINIMA_DO_PRAZO_MS = 30 * MINUTO
const MAXIMO_NA_LISTA = 8
const MINIMO_REAL_NA_LISTA = 4

export const TERMOS_DO_HERO = ['material de limpeza', 'medicamentos', 'notebook', 'pavimentação']

async function buscarPublico<T>(caminho: string, esperaMaximaMs: number): Promise<T | null> {
  try {
    const resposta = await fetch(`${API_URL}${caminho}`, {
      next: { revalidate: DEZ_MINUTOS_EM_SEGUNDOS },
      signal: AbortSignal.timeout(esperaMaximaMs),
    })
    if (!resposta.ok) return null
    return (await resposta.json()) as T
  } catch {
    return null
  }
}

function estatisticasValidas(dados: EstatisticasPublicas | null): EstatisticasPublicas | null {
  if (!dados || typeof dados.abertas !== 'number' || typeof dados.fontes !== 'number') return null
  if (dados.abertas <= 0 || dados.fontes <= 0) return null
  return dados
}

function planosValidos(dados: PlanosResposta | null): PlanosResposta | null {
  if (!dados || !Array.isArray(dados.planos)) return null
  return dados
}

function vitrineValida(dados: RespostaDaVitrine | null): RespostaDaVitrine | null {
  if (!dados || typeof dados.total !== 'number' || dados.total < 0 || !Array.isArray(dados.amostras)) return null
  return { ...dados, amostras: dados.amostras.map((a) => ({ ...a, prazo: dataDaLicitacao(a.prazo, a.fonte) })) }
}

export async function buscarEstatisticas(esperaMaximaMs: number = ESPERA_DAS_ESTATISTICAS_MS): Promise<EstatisticasPublicas | null> {
  return estatisticasValidas(await buscarPublico<EstatisticasPublicas>('/api/public/estatisticas', esperaMaximaMs))
}

export async function buscarPlanos(esperaMaximaMs: number = ESPERA_DOS_PLANOS_MS): Promise<PlanosResposta | null> {
  return planosValidos(await buscarPublico<PlanosResposta>('/api/public/plans', esperaMaximaMs))
}

export async function buscarVitrine(termo: string): Promise<RespostaDaVitrine | null> {
  const query = new URLSearchParams({ q: termo })
  return vitrineValida(await buscarPublico<RespostaDaVitrine>(`/api/public/vitrine?${query.toString()}`, ESPERA_DA_VITRINE_MS))
}

function chaveDaAmostra(amostra: AmostraDaVitrine): string {
  return `${amostra.objeto}|${amostra.orgao}`.toLowerCase().replace(/\s+/g, ' ')
}

function prazoAindaUtil(prazo: string | null, agora: number): boolean {
  if (!prazo) return true
  const instante = instanteDoPrazo(prazo)
  if (!instante) return false
  return instante.getTime() - agora > FOLGA_MINIMA_DO_PRAZO_MS
}

export function juntarAmostras(respostas: Array<RespostaDaVitrine | null>, agora: number = Date.now()): AmostraDaVitrine[] {
  const filas = respostas.map((r) => (r ? r.amostras.filter((a) => a.objeto && a.orgao && prazoAindaUtil(a.prazo, agora)) : []))
  const vistas = new Set<string>()
  const juntas: AmostraDaVitrine[] = []
  const maiorFila = Math.max(0, ...filas.map((f) => f.length))
  for (let posicao = 0; posicao < maiorFila && juntas.length < MAXIMO_NA_LISTA; posicao++) {
    for (const fila of filas) {
      const amostra = fila[posicao]
      if (!amostra) continue
      const chave = chaveDaAmostra(amostra)
      if (vistas.has(chave)) continue
      vistas.add(chave)
      juntas.push(amostra)
      if (juntas.length >= MAXIMO_NA_LISTA) break
    }
  }
  return juntas
}

const EXEMPLOS_DA_LISTA: Array<Omit<AmostraDaVitrine, 'prazo'> & { horas: number }> = [
  { objeto: 'Aquisição de material de limpeza e higienização para escolas da rede municipal', orgao: 'Prefeitura municipal', local: 'Anápolis/GO', fonte: 'PNCP', horas: 26 },
  { objeto: 'Registro de preços para medicamentos da farmácia básica', orgao: 'Secretaria estadual de saúde', local: 'Salvador/BA', fonte: 'PNCP', horas: 3 * 24 },
  { objeto: 'Aquisição de notebooks e monitores para unidades administrativas', orgao: 'Universidade federal', local: 'Recife/PE', fonte: 'PNCP', horas: 5 * 24 },
  { objeto: 'Pavimentação asfáltica e drenagem de vias urbanas', orgao: 'Empresa pública distrital', local: 'Brasília/DF', fonte: 'NOVACAP', horas: 9 * 24 },
  { objeto: 'Gêneros alimentícios para alimentação escolar', orgao: 'Prefeitura municipal', local: 'Uberlândia/MG', fonte: 'QUERIDO_DIARIO', horas: 40 },
  { objeto: 'Mobiliário de escritório: cadeiras, mesas e armários', orgao: 'Unidade do Sistema S', local: 'Goiânia/GO', fonte: 'SISTEMA_S', horas: 6 * 24 },
  { objeto: 'Manutenção predial com fornecimento de materiais', orgao: 'Tribunal regional', local: 'Porto Alegre/RS', fonte: 'PNCP', horas: 11 * 24 },
  { objeto: 'Equipamentos de informática para laboratórios de ensino', orgao: 'Instituto federal', local: 'Campinas/SP', fonte: 'PNCP', horas: 13 * 24 },
]

export function primeiroPrazoUtil(resposta: RespostaDaVitrine | null, agora: number = Date.now()): string | null {
  if (!resposta) return null
  let primeiro: { prazo: string; instante: number } | null = null
  for (const amostra of resposta.amostras) {
    if (!amostra.prazo || !prazoAindaUtil(amostra.prazo, agora)) continue
    const instante = instanteDoPrazo(amostra.prazo)?.getTime() ?? Number.POSITIVE_INFINITY
    if (!primeiro || instante < primeiro.instante) primeiro = { prazo: amostra.prazo, instante }
  }
  return primeiro?.prazo ?? null
}

export function listaIlustrativa(agora: number = Date.now()): AmostraDaVitrine[] {
  return EXEMPLOS_DA_LISTA.map(({ horas, ...resto }) => ({ ...resto, prazo: new Date(agora + horas * HORA).toISOString() }))
}

function valorOuNulo<T>(resultado: PromiseSettledResult<T | null> | undefined): T | null {
  return resultado && resultado.status === 'fulfilled' ? resultado.value : null
}

export async function carregarDadosDaEntrada(termosDosRamos: string[]): Promise<DadosDaEntrada> {
  const termos = [...new Set([...TERMOS_DO_HERO, ...termosDosRamos])]
  const [estatisticas, planos, vitrines] = await Promise.all([
    Promise.allSettled([buscarEstatisticas()]),
    Promise.allSettled([buscarPlanos()]),
    Promise.allSettled(termos.map((t) => buscarVitrine(t))),
  ])
  const respostas = vitrines.map((r) => valorOuNulo(r))
  const porTermo = new Map(termos.map((t, i) => [t, respostas[i] ?? null]))
  const agora = Date.now()
  const totaisPorTermo: Record<string, number | null> = {}
  const primeiroPrazoPorTermo: Record<string, string | null> = {}
  for (const [termo, resposta] of porTermo) {
    totaisPorTermo[termo] = resposta ? resposta.total : null
    primeiroPrazoPorTermo[termo] = primeiroPrazoUtil(resposta, agora)
  }

  const ordemDaLista = [...TERMOS_DO_HERO, ...termos.filter((t) => !TERMOS_DO_HERO.includes(t))]
  const reais = juntarAmostras(ordemDaLista.map((t) => porTermo.get(t) ?? null), agora)
  const chegando: ListaChegando = reais.length >= MINIMO_REAL_NA_LISTA ? { itens: reais, ilustrativo: false } : { itens: listaIlustrativa(agora), ilustrativo: true }

  return {
    estatisticas: valorOuNulo(estatisticas[0]),
    planos: valorOuNulo(planos[0]),
    chegando,
    totaisPorTermo,
    primeiroPrazoPorTermo,
  }
}
