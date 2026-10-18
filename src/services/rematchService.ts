import { createHash } from 'node:crypto'
import type { EstadoDaBusca, MonitoredItem } from '@prisma/client'
import { prisma } from './tenderService'
import { entradaDoItem, findMatchingTendersForItem, reavaliarMatchesDoItem, type ResultadoDaReavaliacao } from './matcherService'
import { notificadorQueue, redisConnection, rematchItemQueue } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { whereLicitacaoAberta } from '../lib/licitacaoAberta'
import { MAX_MATCHES_POR_ITEM, avisoDoLimite, selecionarDentroDoLimite } from '../lib/limiteDeMatches'
import type { ModoDaBuscaDoItem } from '../types'

export const MAX_EMAILS_POR_REMATCH = 20
const JANELA_DO_REMATCH_EM_DIAS = 90
const INTERVALO_DA_ESPERA_MS = 250

type ItemParaRematch = Pick<
  MonitoredItem,
  | 'id'
  | 'companyId'
  | 'userId'
  | 'keywords'
  | 'palavrasDeExclusao'
  | 'catmatCodes'
  | 'catserCodes'
  | 'ufs'
  | 'modalidades'
  | 'orgaos'
  | 'uasgCodes'
  | 'valorMin'
  | 'valorMax'
  | 'raioKm'
  | 'origemLat'
  | 'origemLng'
>

export interface ResultadoDaBusca {
  matchesFound: number
  limitado: boolean
}

export async function contarMatchesAbertosDoItem(itemId: string): Promise<number> {
  return prisma.tenderMatch.count({ where: { monitoredItemId: itemId, tender: whereLicitacaoAberta() } })
}

export async function itensNoLimiteDeMatches(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()
  const grupos = await prisma.tenderMatch.groupBy({
    by: ['monitoredItemId'],
    where: { monitoredItemId: { in: itemIds }, tender: whereLicitacaoAberta() },
    _count: { _all: true },
  })
  return new Set(grupos.filter((g) => g._count._all >= MAX_MATCHES_POR_ITEM).map((g) => g.monitoredItemId))
}

export async function descartarItensNoLimite<T extends { monitoredItemId: string }>(candidatos: T[]): Promise<T[]> {
  const noLimite = await itensNoLimiteDeMatches([...new Set(candidatos.map((c) => c.monitoredItemId))])
  if (noLimite.size === 0) return candidatos
  await prisma.monitoredItem.updateMany({ where: { id: { in: [...noLimite] }, buscaLimitada: false }, data: { buscaLimitada: true } })
  return candidatos.filter((c) => !noLimite.has(c.monitoredItemId))
}

export async function buscarLicitacoesDoItem(item: ItemParaRematch, { notificar }: { notificar: boolean }): Promise<ResultadoDaBusca> {
  const candidates = await findMatchingTendersForItem(entradaDoItem(item), JANELA_DO_REMATCH_EM_DIAS)
  if (candidates.length === 0) return { matchesFound: 0, limitado: false }

  const existing = await prisma.tenderMatch.findMany({
    where: { monitoredItemId: item.id },
    select: { tenderId: true },
  })
  const existingSet = new Set(existing.map((e) => e.tenderId))
  const newCandidates = candidates.filter((c) => !existingSet.has(c.tenderId))
  if (newCandidates.length === 0) return { matchesFound: 0, limitado: false }

  const { selecionados, limitado } = selecionarDentroDoLimite(newCandidates, await contarMatchesAbertosDoItem(item.id))
  if (selecionados.length === 0) return { matchesFound: 0, limitado }

  const { count } = await prisma.tenderMatch.createMany({
    data: selecionados.map((c) => ({
      tenderId: c.tenderId,
      monitoredItemId: item.id,
      companyId: item.companyId,
      userId: item.userId,
      score: c.score,
      matchedByCode: c.matchedByCode,
      matchedKeywords: c.matchedKeywords,
      dentroDeObraCompleta: c.dentroDeObraCompleta,
    })),
    skipDuplicates: true,
  })

  if (notificar) {
    const aNotificar = await prisma.tenderMatch.findMany({
      where: { monitoredItemId: item.id, tenderId: { in: selecionados.slice(0, MAX_EMAILS_POR_REMATCH).map((c) => c.tenderId) } },
      select: { id: true },
    })
    for (const match of aNotificar) {
      await enfileirarSemTravar(notificadorQueue, 'notify-match', { tenderMatchId: match.id }, 'Rematch')
    }
  }

  return { matchesFound: count, limitado }
}

export async function reavaliarEBuscarLicitacoesDoItem(
  item: ItemParaRematch & { active: boolean }
): Promise<ResultadoDaReavaliacao & ResultadoDaBusca> {
  const reavaliacao = await reavaliarMatchesDoItem({ ...entradaDoItem(item), id: item.id, companyId: item.companyId })
  const busca = item.active ? await buscarLicitacoesDoItem(item, { notificar: false }) : { matchesFound: 0, limitado: false }
  return { ...reavaliacao, ...busca }
}

export interface ResultadoDaBuscaDoItem extends ResultadoDaBusca {
  removidos?: number
}

async function marcarBusca(itemId: string, data: { buscaEstado: EstadoDaBusca; buscaEncontrados?: number; buscaRemovidos?: number | null; buscaLimitada?: boolean; buscaConcluidaEm?: Date }) {
  await prisma.monitoredItem.updateMany({ where: { id: itemId }, data })
}

async function rodarBusca(item: MonitoredItem, modo: ModoDaBuscaDoItem): Promise<ResultadoDaBuscaDoItem> {
  if (modo === 'edicao') {
    const { removidos, matchesFound, limitado } = await reavaliarEBuscarLicitacoesDoItem(item)
    return { removidos, matchesFound, limitado }
  }
  if (modo === 'buscar-agora') return buscarLicitacoesDoItem(item, { notificar: true })
  if (!item.active) return { matchesFound: 0, limitado: item.buscaLimitada }
  return buscarLicitacoesDoItem(item, { notificar: false })
}

export async function executarBuscaDoItem(itemId: string, modo: ModoDaBuscaDoItem, { ultimaTentativa = true }: { ultimaTentativa?: boolean } = {}): Promise<ResultadoDaBuscaDoItem | null> {
  const item = await prisma.monitoredItem.findUnique({ where: { id: itemId } })
  if (!item) return null
  await marcarBusca(itemId, { buscaEstado: 'EM_ANDAMENTO' })
  try {
    const resultado = await rodarBusca(item, modo)
    await marcarBusca(itemId, { buscaEstado: 'CONCLUIDA', buscaEncontrados: resultado.matchesFound, buscaRemovidos: resultado.removidos ?? null, buscaLimitada: resultado.limitado, buscaConcluidaEm: new Date() })
    return resultado
  } catch (err) {
    if (ultimaTentativa) await marcarBusca(itemId, { buscaEstado: 'FALHOU', buscaConcluidaEm: new Date() }).catch(() => undefined)
    throw err
  }
}

export function idDoJobDeBusca(item: Parameters<typeof entradaDoItem>[0] & { id: string; active: boolean }, modo: ModoDaBuscaDoItem): string {
  const recorte = createHash('sha1').update(JSON.stringify({ ...entradaDoItem(item), active: item.active })).digest('hex').slice(0, 16)
  return `${item.id}-${modo}-${recorte}`
}

export type RespostaDaBusca = { busca: 'em-andamento' } | ({ busca: 'concluida' } & ResultadoDaBuscaDoItem)

export async function solicitarBuscaDoItem(item: ItemParaRematch & { active: boolean }, modo: ModoDaBuscaDoItem): Promise<RespostaDaBusca> {
  await marcarBusca(item.id, { buscaEstado: 'EM_ANDAMENTO' })
  const filaDisponivel = redisConnection.status === 'ready'
  if (filaDisponivel && (await enfileirarSemTravar(rematchItemQueue, 'rematch-item', { itemId: item.id, modo }, 'Busca do item', { jobId: idDoJobDeBusca(item, modo) }))) {
    return { busca: 'em-andamento' }
  }
  const resultado = await executarBuscaDoItem(item.id, modo)
  return { busca: 'concluida', ...(resultado ?? { matchesFound: 0, limitado: false }) }
}

export type EstadoPublicoDaBusca = 'em-andamento' | 'concluida' | 'falhou'

export interface SituacaoDaBusca {
  estado: EstadoPublicoDaBusca
  encontrados: number | null
  removidos: number | null
  limitado: boolean
  aviso: string | null
  concluidaEm: Date | null
}

const ESTADO_PUBLICO: Record<EstadoDaBusca, EstadoPublicoDaBusca> = {
  EM_ANDAMENTO: 'em-andamento',
  CONCLUIDA: 'concluida',
  FALHOU: 'falhou',
}

export function situacaoDaBusca(item: Pick<MonitoredItem, 'buscaEstado' | 'buscaEncontrados' | 'buscaRemovidos' | 'buscaLimitada' | 'buscaConcluidaEm'>): SituacaoDaBusca {
  return {
    estado: item.buscaEstado ? ESTADO_PUBLICO[item.buscaEstado] : 'concluida',
    encontrados: item.buscaEncontrados,
    removidos: item.buscaRemovidos,
    limitado: item.buscaLimitada,
    aviso: item.buscaLimitada ? avisoDoLimite() : null,
    concluidaEm: item.buscaConcluidaEm,
  }
}

export async function aguardarFimDaBusca(itemId: string, esperaMaximaMs: number): Promise<boolean> {
  const limite = Date.now() + esperaMaximaMs
  for (;;) {
    const item = await prisma.monitoredItem.findUnique({ where: { id: itemId }, select: { buscaEstado: true } })
    if (!item || item.buscaEstado !== 'EM_ANDAMENTO') return true
    if (Date.now() + INTERVALO_DA_ESPERA_MS > limite) return false
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_DA_ESPERA_MS))
  }
}
