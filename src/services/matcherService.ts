// ============================================================
// services/matcherService.ts — Cruza licitações com itens monitorados.
// As regras puras (borda de palavra, portões, score) vivem em
// lib/matching.ts; aqui fica só o acesso ao banco.
// ============================================================

import { ModalidadeEnum, Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import { calcularAderencia } from '../lib/aderencia'
import { estaAberta, whereLicitacaoAberta } from '../lib/licitacaoAberta'
import {
  CODE_MATCH_SCORE,
  Gates,
  KEYWORD_MATCH_SCORE,
  KeywordPattern,
  compileKeywordPatterns,
  estaDentroDeObraCompleta,
  matchedKeywords,
  passaNosPortoes,
  termosDoPreFiltro,
} from '../lib/matching'

export { CODE_MATCH_SCORE, KEYWORD_MATCH_SCORE }

// Tudo menos rawJson: o JSON bruto do PNCP tem alguns KB por licitação e
// carregá-lo para milhares de registros era o que estourava a memória do
// processo da API durante o rematch.
const TENDER_SELECT = {
  id: true,
  fonte: true,
  uf: true,
  situacao: true,
  modalidade: true,
  orgao: true,
  unidade: true,
  objeto: true,
  objetoNorm: true,
  valorEstimado: true,
  encerramentoAt: true,
  aberturaAt: true,
  publicadoAt: true,
  createdAt: true,
  valorHomologado: true,
  municipioLat: true,
  municipioLng: true,
  items: { select: { descricao: true, descricaoNorm: true, catmatCode: true, catserCode: true } },
} satisfies Prisma.TenderSelect

type TenderParaMatch = Prisma.TenderGetPayload<{ select: typeof TENDER_SELECT }>

export interface MatchCandidate {
  monitoredItemId: string
  companyId: string
  userId: string
  // Nota de aderência (0–100) dividida por 100 — ver lib/aderencia.ts.
  score: number
  matchedKeywords: string[]
  matchedByCode: boolean
  dentroDeObraCompleta: boolean
}

// Nota de aderência (0–1) de uma licitação para um item. Os portões já passaram;
// aqui só se mede o QUÃO BOM é o match.
function scoreDeAderencia(
  tender: TenderParaMatch,
  item: {
    ufs: string[]
    valorMin: number | null
    valorMax: number | null
    raioKm: number | null
    origemLat: number | null
    origemLng: number | null
  },
  porCodigo: boolean,
  palavrasEncontradas: number,
  palavrasTotal: number,
  dentroDeObraCompleta: boolean
): number {
  const { nota } = calcularAderencia({
    porCodigo,
    palavrasEncontradas,
    palavrasTotal,
    dentroDeObraCompleta,
    item,
    tender: {
      uf: tender.uf,
      valorEstimado: tender.valorEstimado != null ? Number(tender.valorEstimado) : null,
      encerramentoAt: tender.encerramentoAt,
      municipioLat: tender.municipioLat,
      municipioLng: tender.municipioLng,
    },
  })
  return nota / 100
}

function tenderGateInput(tender: TenderParaMatch) {
  return {
    fonte: tender.fonte,
    uf: tender.uf,
    modalidade: tender.modalidade,
    orgao: tender.orgao,
    unidade: tender.unidade,
    valorEstimado: tender.valorEstimado != null ? Number(tender.valorEstimado) : null,
    municipioLat: tender.municipioLat,
    municipioLng: tender.municipioLng,
  }
}

function temCodigoEmComum(
  tender: TenderParaMatch,
  catmatCodes: string[],
  catserCodes: string[]
): boolean {
  return tender.items.some(
    (ti) =>
      (ti.catmatCode && catmatCodes.includes(ti.catmatCode)) ||
      (ti.catserCode && catserCodes.includes(ti.catserCode))
  )
}

export interface RegrasDoItem {
  gates: Gates
  palavrasChave: KeywordPattern[]
  exclusoes: KeywordPattern[]
  totalDePalavras: number
  catmatCodes: string[]
  catserCodes: string[]
}

export function compilarRegrasDoItem(item: RematchInput): RegrasDoItem {
  return {
    gates: {
      ufs: item.ufs,
      modalidades: item.modalidades,
      orgaos: item.orgaos,
      uasgCodes: item.uasgCodes,
      valorMin: item.valorMin,
      valorMax: item.valorMax,
      raioKm: item.raioKm,
      origemLat: item.origemLat,
      origemLng: item.origemLng,
    },
    palavrasChave: compileKeywordPatterns(item.keywords),
    exclusoes: compileKeywordPatterns(item.palavrasDeExclusao),
    totalDePalavras: item.keywords.length,
    catmatCodes: item.catmatCodes,
    catserCodes: item.catserCodes,
  }
}

export interface AvaliacaoDoMatch {
  score: number
  matchedKeywords: string[]
  matchedByCode: boolean
  dentroDeObraCompleta: boolean
}

export function avaliarLicitacaoParaItem(tender: TenderParaMatch, regras: RegrasDoItem, agora: Date = new Date()): AvaliacaoDoMatch | null {
  if (!estaAberta(tender, agora)) return null
  if (!passaNosPortoes(regras.gates, tenderGateInput(tender))) return null

  const objetoNorm = tender.objetoNorm ?? normalize(tender.objeto)
  const itemDescsNorm = tender.items.map((i) => i.descricaoNorm ?? normalize(i.descricao))
  const encontradas = matchedKeywords(regras.palavrasChave, objetoNorm, itemDescsNorm)
  const codeMatch = temCodigoEmComum(tender, regras.catmatCodes, regras.catserCodes)

  if (encontradas.length === 0 && !codeMatch) return null
  if (matchedKeywords(regras.exclusoes, objetoNorm, itemDescsNorm).length > 0) return null

  const dentroDeObraCompleta = !codeMatch && estaDentroDeObraCompleta(objetoNorm, encontradas)
  return {
    score: scoreDeAderencia(tender, regras.gates, codeMatch, encontradas.length, regras.totalDePalavras, dentroDeObraCompleta),
    matchedKeywords: encontradas,
    matchedByCode: codeMatch,
    dentroDeObraCompleta,
  }
}

export function entradaDoItem(item: {
  keywords: string[]
  palavrasDeExclusao: string[]
  catmatCodes: string[]
  catserCodes: string[]
  ufs: string[]
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  valorMin: Prisma.Decimal | number | null
  valorMax: Prisma.Decimal | number | null
  raioKm: number | null
  origemLat: number | null
  origemLng: number | null
}): RematchInput {
  return {
    keywords: item.keywords,
    palavrasDeExclusao: item.palavrasDeExclusao,
    catmatCodes: item.catmatCodes,
    catserCodes: item.catserCodes,
    ufs: item.ufs,
    modalidades: item.modalidades,
    orgaos: item.orgaos,
    uasgCodes: item.uasgCodes,
    valorMin: item.valorMin != null ? Number(item.valorMin) : null,
    valorMax: item.valorMax != null ? Number(item.valorMax) : null,
    raioKm: item.raioKm,
    origemLat: item.origemLat,
    origemLng: item.origemLng,
  }
}

export async function findMatchCandidates(tenderId: string): Promise<MatchCandidate[]> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: TENDER_SELECT })
  if (!tender || !estaAberta(tender)) return []

  const monitoredItems = await prisma.monitoredItem.findMany({ where: { active: true } })

  const candidates: MatchCandidate[] = []
  for (const mi of monitoredItems) {
    const avaliacao = avaliarLicitacaoParaItem(tender, compilarRegrasDoItem(entradaDoItem(mi)))
    if (!avaliacao) continue
    candidates.push({ monitoredItemId: mi.id, companyId: mi.companyId, userId: mi.userId, ...avaliacao })
  }

  return candidates
}

export interface RematchInput {
  keywords: string[]
  palavrasDeExclusao: string[]
  catmatCodes: string[]
  catserCodes: string[]
  ufs: string[]
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  valorMin: number | null
  valorMax: number | null
  raioKm: number | null
  origemLat: number | null
  origemLng: number | null
}

export interface RematchCandidate {
  tenderId: string
  score: number
  matchedKeywords: string[]
  matchedByCode: boolean
  dentroDeObraCompleta: boolean
}

const REMATCH_BATCH_SIZE = 500

function whereDoRematch(item: RematchInput, cutoff: Date): Prisma.TenderWhereInput {
  const condicoes: Prisma.TenderWhereInput[] = [{ createdAt: { gte: cutoff } }, whereLicitacaoAberta()]

  if (item.raioKm == null && item.ufs.length > 0) condicoes.push({ uf: { in: item.ufs } })
  if (item.modalidades.length > 0) condicoes.push({ modalidade: { in: item.modalidades as ModalidadeEnum[] } })

  const faixa: { gte?: number; lte?: number } = {}
  if (item.valorMin != null) faixa.gte = item.valorMin
  if (item.valorMax != null) faixa.lte = item.valorMax
  if (Object.keys(faixa).length > 0) condicoes.push({ OR: [{ valorEstimado: faixa }, { valorEstimado: null }] })

  const termos = [...new Set(item.keywords.flatMap(termosDoPreFiltro))]
  const filtroDeTexto: Prisma.TenderWhereInput[] = termos.flatMap((termo) => [
    { objetoNorm: { contains: termo } },
    { items: { some: { descricaoNorm: { contains: termo } } } },
  ])
  if (filtroDeTexto.length > 0 && item.catmatCodes.length === 0 && item.catserCodes.length === 0) {
    condicoes.push({ OR: filtroDeTexto })
  }

  return { AND: condicoes }
}

export async function findMatchingTendersForItem(
  item: RematchInput,
  sinceDays = 90
): Promise<RematchCandidate[]> {
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
  const where = whereDoRematch(item, cutoff)
  const regras = compilarRegrasDoItem(item)
  const agora = new Date()
  const results: RematchCandidate[] = []
  let cursor: string | undefined

  for (;;) {
    const lote: TenderParaMatch[] = await prisma.tender.findMany({
      where,
      select: TENDER_SELECT,
      orderBy: { id: 'asc' },
      take: REMATCH_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    if (lote.length === 0) break

    for (const t of lote) {
      const avaliacao = avaliarLicitacaoParaItem(t, regras, agora)
      if (avaliacao) results.push({ tenderId: t.id, ...avaliacao })
    }

    if (lote.length < REMATCH_BATCH_SIZE) break
    cursor = lote[lote.length - 1].id
  }

  return results
}

const LOTE_DA_REAVALIACAO = 500

export interface ResultadoDaReavaliacao {
  removidos: number
  atualizados: number
  mantidosPorPlano: number
}

function mesmaAvaliacao(antes: { matchedKeywords: string[]; matchedByCode: boolean; dentroDeObraCompleta: boolean }, depois: AvaliacaoDoMatch): boolean {
  return (
    antes.matchedByCode === depois.matchedByCode &&
    antes.dentroDeObraCompleta === depois.dentroDeObraCompleta &&
    antes.matchedKeywords.length === depois.matchedKeywords.length &&
    antes.matchedKeywords.every((palavra, i) => palavra === depois.matchedKeywords[i])
  )
}

export async function reavaliarMatchesDoItem(item: RematchInput & { id: string; companyId: string }): Promise<ResultadoDaReavaliacao> {
  const regras = compilarRegrasDoItem(item)
  const agora = new Date()
  const planos = await prisma.tenderParticipationPlan.findMany({ where: { companyId: item.companyId }, select: { tenderId: true } })
  const comPlano = new Set(planos.map((p) => p.tenderId))
  const paraRemover: string[] = []
  const paraAtualizar: { id: string; avaliacao: AvaliacaoDoMatch }[] = []
  let mantidosPorPlano = 0
  let cursor: string | undefined

  for (;;) {
    const lote = await prisma.tenderMatch.findMany({
      where: { monitoredItemId: item.id },
      select: { id: true, tenderId: true, matchedKeywords: true, matchedByCode: true, dentroDeObraCompleta: true, tender: { select: TENDER_SELECT } },
      orderBy: { id: 'asc' },
      take: LOTE_DA_REAVALIACAO,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (lote.length === 0) break

    for (const match of lote) {
      const avaliacao = avaliarLicitacaoParaItem(match.tender, regras, agora)
      if (!avaliacao) {
        if (comPlano.has(match.tenderId)) mantidosPorPlano++
        else paraRemover.push(match.id)
      } else if (!mesmaAvaliacao(match, avaliacao)) {
        paraAtualizar.push({ id: match.id, avaliacao })
      }
    }

    if (lote.length < LOTE_DA_REAVALIACAO) break
    cursor = lote[lote.length - 1].id
  }

  for (let i = 0; i < paraRemover.length; i += LOTE_DA_REAVALIACAO) {
    await prisma.tenderMatch.deleteMany({ where: { id: { in: paraRemover.slice(i, i + LOTE_DA_REAVALIACAO) } } })
  }
  for (const { id, avaliacao } of paraAtualizar) {
    await prisma.tenderMatch.update({ where: { id }, data: avaliacao })
  }

  return { removidos: paraRemover.length, atualizados: paraAtualizar.length, mantidosPorPlano }
}
