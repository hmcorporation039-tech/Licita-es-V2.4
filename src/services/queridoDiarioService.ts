import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { ModalidadeEnum, NormalizedTender } from '../types'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import { queridoDiarioArquivosClient, queridoDiarioClient } from '../lib/httpClient'
import { GazetaQueridoDiario } from './queridoDiarioParser'

export const TERMOS_DE_BUSCA = [
  'aviso de licitação',
  'aviso de abertura',
  'aviso de pregão',
  'aviso de edital',
  'aviso de dispensa',
  'aviso de credenciamento',
  'pregão eletrônico',
  'pregão presencial',
  'dispensa eletrônica',
  'concorrência',
  'concorrência eletrônica',
  'tomada de preços',
  'chamamento público',
  'credenciamento',
]
export const CONSULTA_DE_AVISOS = TERMOS_DE_BUSCA.map((termo) => `"${termo}"`).join(' | ')
export const TAMANHO_DA_PAGINA = 50
export const NIVEIS_DE_CIDADE_COM_DIARIOS = ['1', '2', '3']
export const HOST_DOS_ARQUIVOS_DO_QUERIDO_DIARIO = 'data.queridodiario.ok.org.br'

const DIAS_DE_SOBREPOSICAO = 2
const DIAS_SEM_CURSOR = 5
const JANELA_MAXIMA_DIAS = 30
const SIMILARIDADE_MINIMA_COM_O_PNCP = 0.45
const SIMILARIDADE_MINIMA_NO_MESMO_DIA = 0.2
export const SIMILARIDADE_MINIMA_PARA_ESCONDER_NO_MESMO_DIA = 0.4
const SIMILARIDADE_MINIMA_COM_O_MESMO_NUMERO = 0.1
const SEMELHANCA_MINIMA_ENTRE_REPUBLICACOES = 0.3
const DIAS_DE_HISTORICO_DO_PNCP = 180
const HORAS_DE_BRASILIA_PARA_UTC = 3
const DIA_MS = 86_400_000

export interface JanelaDoQueridoDiario {
  publicadoDesde: string
  publicadoAte: string
}

export interface PaginaDoQueridoDiario {
  total_gazettes: number
  gazettes: GazetaQueridoDiario[]
}

export interface CidadeDoQueridoDiario {
  territory_id: string
  territory_name: string
  state_code: string
  level?: string
}

export interface CandidatoDoPncp {
  aberturaAt: Date | null
  encerramentoAt: Date | null
  similaridade: number
  numeroCompra?: string | null
  anoCompra?: string | number | null
}

export interface NumeroDoAviso {
  sequencial: number
  ano: string
}

export interface RegistroJaColetado {
  objeto: string
  publicadoAt: Date | null
  linkEdital: string | null
  rawJson: unknown
}

function diaEmBrasilia(data: Date): string {
  return new Date(data.getTime() - HORAS_DE_BRASILIA_PARA_UTC * 3_600_000).toISOString().slice(0, 10)
}

export function janelaDoQueridoDiario(agora: Date, ultimaPublicacao: Date | null): JanelaDoQueridoDiario {
  const semCursor = agora.getTime() - DIAS_SEM_CURSOR * DIA_MS
  const pelaUltimaPublicacao = ultimaPublicacao ? ultimaPublicacao.getTime() - DIAS_DE_SOBREPOSICAO * DIA_MS : semCursor
  const limiteAntigo = agora.getTime() - JANELA_MAXIMA_DIAS * DIA_MS
  const inicio = Math.max(limiteAntigo, Math.min(semCursor, pelaUltimaPublicacao))
  return { publicadoDesde: diaEmBrasilia(new Date(inicio)), publicadoAte: diaEmBrasilia(agora) }
}

export function statusDaResposta(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const status = (err as { response?: { status?: unknown } }).response?.status
  return typeof status === 'number' ? status : undefined
}

export function ehBloqueioDoQueridoDiario(err: unknown): boolean {
  const status = statusDaResposta(err)
  return status === 403 || status === 429
}

export async function buscarCidadesDoQueridoDiario(): Promise<CidadeDoQueridoDiario[]> {
  const resposta = await queridoDiarioClient.get<{ cities?: CidadeDoQueridoDiario[] }>('/cities', {
    params: { levels: NIVEIS_DE_CIDADE_COM_DIARIOS },
    paramsSerializer: { indexes: null },
  })
  return resposta.data.cities ?? []
}

export async function buscarDiarios(
  janela: JanelaDoQueridoDiario,
  offset: number,
  territorios: string[] = []
): Promise<PaginaDoQueridoDiario> {
  const params = {
    territory_ids: territorios,
    querystring: CONSULTA_DE_AVISOS,
    published_since: janela.publicadoDesde,
    published_until: janela.publicadoAte,
    size: TAMANHO_DA_PAGINA,
    offset,
    excerpt_size: 50,
    number_of_excerpts: 1,
    sort_by: 'descending_date',
  }
  const resposta = await queridoDiarioClient.get<PaginaDoQueridoDiario>('/gazettes', {
    params,
    paramsSerializer: { indexes: null },
  })
  return resposta.data
}

export function caminhoDoArquivoDoDiario(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== HOST_DOS_ARQUIVOS_DO_QUERIDO_DIARIO) return null
    return u.pathname
  } catch {
    return null
  }
}

export async function baixarTextoDoDiario(txtUrl: string): Promise<string> {
  const caminho = caminhoDoArquivoDoDiario(txtUrl)
  if (!caminho) throw new Error(`Endereço de texto fora do Querido Diário: ${txtUrl}`)
  const resposta = await queridoDiarioArquivosClient.get<string>(caminho, {
    responseType: 'text',
    transformResponse: (dados) => dados,
  })
  return resposta.data
}

export function modalidadesEquivalentes(modalidade: ModalidadeEnum): ModalidadeEnum[] {
  if (modalidade === 'PREGAO_ELETRONICO' || modalidade === 'PREGAO_PRESENCIAL') return ['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL']
  if (modalidade === 'DISPENSA_COM_DISPUTA' || modalidade === 'DISPENSA_SEM_DISPUTA') {
    return ['DISPENSA_COM_DISPUTA', 'DISPENSA_SEM_DISPUTA']
  }
  if (modalidade === 'CREDENCIAMENTO' || modalidade === 'INEXIGIBILIDADE') return ['CREDENCIAMENTO', 'INEXIGIBILIDADE']
  return [modalidade]
}

export function numeroDoAviso(fonteId: string | undefined): NumeroDoAviso | null {
  const m = /:(\d+)-(20\d{2})[A-Z]?(?::|$)/.exec(fonteId ?? '')
  return m ? { sequencial: Number(m[1]), ano: m[2] } : null
}

export function mesmoNumeroDoPncp(numero: NumeroDoAviso | null, candidato: CandidatoDoPncp): boolean {
  if (!numero || !candidato.numeroCompra || String(candidato.anoCompra ?? '') !== numero.ano) return false
  const digitos = /\d+/.exec(candidato.numeroCompra.replace(/(\d)\.(?=\d{3})/g, '$1'))
  return digitos !== null && Number(digitos[0]) === numero.sequencial
}

export function ehMesmaLicitacaoDoPncp(
  tender: Pick<NormalizedTender, 'aberturaAt'> & Partial<Pick<NormalizedTender, 'fonteId'>>,
  candidato: CandidatoDoPncp,
  similaridadeMinimaNoMesmoDia: number = SIMILARIDADE_MINIMA_NO_MESMO_DIA
): boolean {
  if (Number(candidato.similaridade) >= SIMILARIDADE_MINIMA_COM_O_PNCP) return true
  if (
    Number(candidato.similaridade) >= SIMILARIDADE_MINIMA_COM_O_MESMO_NUMERO &&
    mesmoNumeroDoPncp(numeroDoAviso(tender.fonteId), candidato)
  ) {
    return true
  }
  if (!tender.aberturaAt || Number(candidato.similaridade) < similaridadeMinimaNoMesmoDia) return false
  const dia = diaEmBrasilia(tender.aberturaAt)
  return [candidato.aberturaAt, candidato.encerramentoAt].some((data) => data !== null && diaEmBrasilia(new Date(data)) === dia)
}

export async function licitacaoDoPncpEquivalente(tender: NormalizedTender, agora: Date = new Date()): Promise<string | null> {
  if (!tender.uf || (!tender.municipioIbge && !tender.municipio)) return null
  const modalidades = modalidadesEquivalentes(tender.modalidade)
  const limite = new Date(agora.getTime() - DIAS_DE_HISTORICO_DO_PNCP * DIA_MS)
  const municipioNorm = tender.municipio ? normalize(tender.municipio) : null
  const candidatos = await prisma.$queryRaw<(CandidatoDoPncp & { id: string })[]>`
    SELECT id,
           abertura_at AS "aberturaAt",
           encerramento_at AS "encerramentoAt",
           similarity(coalesce(objeto_norm, ''), ${normalize(tender.objeto)})::float8 AS similaridade,
           raw_json->>'numeroCompra' AS "numeroCompra",
           raw_json->>'anoCompra' AS "anoCompra"
    FROM tenders
    WHERE fonte = 'PNCP'
      AND uf = ${tender.uf}
      AND publicado_at >= ${limite}
      AND modalidade::text IN (${Prisma.join(modalidades)})
      AND (municipio_ibge = ${tender.municipioIbge ?? null} OR municipio_norm = ${municipioNorm})
    ORDER BY similaridade DESC
    LIMIT 50
  `
  return candidatos.find((candidato) => ehMesmaLicitacaoDoPncp(tender, candidato))?.id ?? null
}

export async function existeNoPncp(tender: NormalizedTender, agora: Date = new Date()): Promise<boolean> {
  return (await licitacaoDoPncpEquivalente(tender, agora)) !== null
}

function palavrasDoObjeto(objeto: string): Set<string> {
  return new Set(
    normalize(objeto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4)
  )
}

export function objetosCompativeis(a: string, b: string): boolean {
  const pa = palavrasDoObjeto(a)
  const pb = palavrasDoObjeto(b)
  if (pa.size === 0 || pb.size === 0) return normalize(a) === normalize(b)
  let comuns = 0
  for (const p of pa) if (pb.has(p)) comuns++
  return comuns / (pa.size + pb.size - comuns) >= SEMELHANCA_MINIMA_ENTRE_REPUBLICACOES
}

function dataDoDiarioNoRegistro(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== 'object') return null
  const data = (rawJson as Record<string, unknown>).date
  return typeof data === 'string' ? data : null
}

export function ajustarRepublicacao(tender: NormalizedTender, existente: RegistroJaColetado | null): NormalizedTender | null {
  if (!existente) return tender

  if (!objetosCompativeis(tender.objeto, existente.objeto)) {
    const sufixo = createHash('sha256').update(normalize(tender.objeto)).digest('hex').slice(0, 8)
    return { ...tender, fonteId: `${tender.fonteId}:${sufixo}` }
  }

  const dataNova = dataDoDiarioNoRegistro(tender.rawJson)
  const dataAnterior = dataDoDiarioNoRegistro(existente.rawJson)
  if (dataNova && dataAnterior && dataNova < dataAnterior) return null

  const primeiraPublicacao =
    existente.publicadoAt && tender.publicadoAt && existente.publicadoAt.getTime() < tender.publicadoAt.getTime()
      ? existente.publicadoAt
      : tender.publicadoAt
  const linkEhDoDiario = tender.linkEdital !== undefined && tender.linkEdital === tender.rawJson.gazetteUrl
  const linkEdital = linkEhDoDiario && existente.linkEdital ? existente.linkEdital : tender.linkEdital

  return { ...tender, publicadoAt: primeiraPublicacao, linkEdital }
}

export async function prepararRepublicacao(tender: NormalizedTender): Promise<NormalizedTender | null> {
  const existente = await prisma.tender.findUnique({
    where: { fonteId: tender.fonteId },
    select: { objeto: true, publicadoAt: true, linkEdital: true, rawJson: true },
  })
  const ajustado = ajustarRepublicacao(tender, existente)
  if (!ajustado || ajustado.fonteId === tender.fonteId) return ajustado

  const homonimo = await prisma.tender.findUnique({
    where: { fonteId: ajustado.fonteId },
    select: { objeto: true, publicadoAt: true, linkEdital: true, rawJson: true },
  })
  return homonimo ? ajustarRepublicacao(ajustado, homonimo) : ajustado
}
