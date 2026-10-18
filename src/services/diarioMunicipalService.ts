import { diarioMunicipalClient } from '../lib/httpClient'
import { NormalizedTender } from '../types'
import { prisma } from './tenderService'
import { AssociacaoSigpub, PaginaDeBusca, lerPaginaDeBusca } from './diarioMunicipalParser'

export const TERMOS_DE_BUSCA_SIGPUB = [
  'aviso de licitação',
  'pregão eletrônico',
  'pregão presencial',
  'dispensa eletrônica',
  'concorrência',
  'chamamento público',
  'credenciamento',
]
export const DIAS_DA_JANELA = 5

const HORAS_DE_BRASILIA_PARA_UTC = 3
const DIA_MS = 86_400_000
const SUFIXO_DE_REPUBLICACAO = /^:[0-9a-f]{8}$/

export interface JanelaDoDiarioMunicipal {
  dataInicio: string
  dataFim: string
}

function diaEmBrasilia(instante: number): string {
  return new Date(instante - HORAS_DE_BRASILIA_PARA_UTC * 3_600_000).toISOString().slice(0, 10)
}

export function janelaDoDiarioMunicipal(agora: Date, dias: number = DIAS_DA_JANELA): JanelaDoDiarioMunicipal {
  return {
    dataInicio: diaEmBrasilia(agora.getTime() - (Math.max(1, dias) - 1) * DIA_MS),
    dataFim: diaEmBrasilia(agora.getTime()),
  }
}

export function parametrosDaBusca(termo: string, janela: JanelaDoDiarioMunicipal, pagina: number): Record<string, string> {
  return {
    'busca_avancada[texto]': termo,
    'busca_avancada[dataInicio]': janela.dataInicio,
    'busca_avancada[dataFim]': janela.dataFim,
    'busca_avancada[ordenacao]': 'recente',
    'busca_avancada[pagina]': String(pagina),
  }
}

async function pegarHtml(caminho: string, params?: Record<string, string>): Promise<string> {
  const resposta = await diarioMunicipalClient.get<string>(caminho, {
    params,
    responseType: 'text',
    transformResponse: (dados) => dados,
  })
  return typeof resposta.data === 'string' ? resposta.data : String(resposta.data ?? '')
}

export async function buscarMaterias(
  associacao: AssociacaoSigpub,
  termo: string,
  janela: JanelaDoDiarioMunicipal,
  pagina: number
): Promise<PaginaDeBusca> {
  return lerPaginaDeBusca(await pegarHtml(`/${associacao.slug}/pesquisar`, parametrosDaBusca(termo, janela, pagina)))
}

export async function baixarMateria(associacao: AssociacaoSigpub, codigo: string): Promise<string> {
  if (!/^[0-9A-Z]{6,12}$/.test(codigo)) throw new Error(`Código de matéria inválido: ${codigo}`)
  return pegarHtml(`/${associacao.slug}/materia/${codigo}`)
}

export function equivalenteNoQueridoDiario(fonteId: string): string | null {
  return fonteId.startsWith('DM-') ? `QD-${fonteId.slice(3)}` : null
}

export async function existeNoQueridoDiario(tender: NormalizedTender): Promise<boolean> {
  const equivalente = equivalenteNoQueridoDiario(tender.fonteId)
  if (!equivalente) return false
  const achados = await prisma.tender.findMany({
    where: { fonte: 'QUERIDO_DIARIO', fonteId: { startsWith: equivalente } },
    select: { fonteId: true },
    take: 20,
  })
  return achados.some(
    ({ fonteId }) => fonteId === equivalente || SUFIXO_DE_REPUBLICACAO.test(fonteId.slice(equivalente.length))
  )
}
