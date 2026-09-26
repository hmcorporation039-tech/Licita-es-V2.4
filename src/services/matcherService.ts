// ============================================================
// services/matcherService.ts — Cruza licitações com itens monitorados.
// As regras puras (borda de palavra, portões, score) vivem em
// lib/matching.ts; aqui fica só o acesso ao banco.
// ============================================================

import { ModalidadeEnum, Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import {
  CODE_MATCH_SCORE,
  Gates,
  KEYWORD_MATCH_SCORE,
  compileKeywordPatterns,
  matchedKeywords,
  passaNosPortoes,
  scoreDoMatch,
} from '../lib/matching'

export { CODE_MATCH_SCORE, KEYWORD_MATCH_SCORE }

// Tudo menos rawJson: o JSON bruto do PNCP tem alguns KB por licitação e
// carregá-lo para milhares de registros era o que estourava a memória do
// processo da API durante o rematch.
const TENDER_SELECT = {
  id: true,
  fonte: true,
  uf: true,
  modalidade: true,
  orgao: true,
  unidade: true,
  objeto: true,
  objetoNorm: true,
  valorEstimado: true,
  municipioLat: true,
  municipioLng: true,
  items: { select: { descricao: true, descricaoNorm: true, catmatCode: true, catserCode: true } },
} satisfies Prisma.TenderSelect

type TenderParaMatch = Prisma.TenderGetPayload<{ select: typeof TENDER_SELECT }>

export interface MatchCandidate {
  monitoredItemId: string
  userId: string
  score: number
  matchedKeywords: string[]
}

function gatesDoItem(item: {
  ufs: string[]
  modalidades: string[]
  orgaos: string[]
  uasgCodes: string[]
  valorMin: Prisma.Decimal | null
  valorMax: Prisma.Decimal | null
  raioKm: number | null
  origemLat: number | null
  origemLng: number | null
}): Gates {
  return {
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

export async function findMatchCandidates(tenderId: string): Promise<MatchCandidate[]> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: TENDER_SELECT })
  if (!tender) return []

  const objetoNorm = tender.objetoNorm ?? normalize(tender.objeto)
  const itemDescsNorm = tender.items.map((i) => i.descricaoNorm ?? normalize(i.descricao))
  const gateInput = tenderGateInput(tender)

  const monitoredItems = await prisma.monitoredItem.findMany({ where: { active: true } })

  const candidates: MatchCandidate[] = []

  for (const mi of monitoredItems) {
    if (!passaNosPortoes(gatesDoItem(mi), gateInput)) continue

    const encontradas = matchedKeywords(compileKeywordPatterns(mi.keywords), objetoNorm, itemDescsNorm)
    const codeMatch = temCodigoEmComum(tender, mi.catmatCodes, mi.catserCodes)

    if (encontradas.length === 0 && !codeMatch) continue

    candidates.push({
      monitoredItemId: mi.id,
      userId: mi.userId,
      score: scoreDoMatch(codeMatch),
      matchedKeywords: encontradas,
    })
  }

  return candidates
}

export interface RematchInput {
  keywords: string[]
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
}

const REMATCH_BATCH_SIZE = 500

// Monta o recorte que o Postgres consegue aplicar sozinho. Os portões viram
// WHERE; as palavras-chave viram um pré-filtro por substring (que o índice GIN
// de trigramas atende) e o casamento exato com borda de palavra continua sendo
// feito em memória, só sobre o conjunto já reduzido — a semântica literal do
// matcher é decisão de produto e não muda aqui.
function whereDoRematch(item: RematchInput, cutoff: Date): Prisma.TenderWhereInput {
  const where: Prisma.TenderWhereInput = { createdAt: { gte: cutoff } }

  if (item.ufs.length > 0) where.uf = { in: item.ufs }
  if (item.modalidades.length > 0) where.modalidade = { in: item.modalidades as ModalidadeEnum[] }

  const faixa: { gte?: number; lte?: number } = {}
  if (item.valorMin != null) faixa.gte = item.valorMin
  if (item.valorMax != null) faixa.lte = item.valorMax
  // valorEstimado nulo não é reprovado pelo filtro de faixa (mesma regra de
  // passaNosPortoes, que só compara quando o valor existe).
  if (Object.keys(faixa).length > 0) {
    where.OR = [{ valorEstimado: faixa }, { valorEstimado: null }]
  }

  // O casamento em memória procura a palavra no objeto E na descrição dos
  // itens — o pré-filtro precisa cobrir os dois, senão descartaria no banco
  // licitações que dariam match pela descrição do item.
  const termos = item.keywords.map((k) => normalize(k).trim()).filter(Boolean)
  const filtroDeTexto: Prisma.TenderWhereInput[] = termos.flatMap((termo) => [
    { objetoNorm: { contains: termo } },
    { items: { some: { descricaoNorm: { contains: termo } } } },
  ])

  if (filtroDeTexto.length > 0 && item.catmatCodes.length === 0 && item.catserCodes.length === 0) {
    where.AND = [{ OR: filtroDeTexto }]
  }

  return where
}

// Direção inversa do matching: dado um item monitorado (geralmente um recém-cadastrado),
// varre as licitações já coletadas nos últimos `sinceDays` dias em busca de coincidências —
// evita que o usuário precise esperar o próximo ciclo de coleta para ver resultados.
export async function findMatchingTendersForItem(
  item: RematchInput,
  sinceDays = 90
): Promise<RematchCandidate[]> {
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
  const where = whereDoRematch(item, cutoff)

  const gates: Gates = {
    ufs: item.ufs,
    modalidades: item.modalidades,
    orgaos: item.orgaos,
    uasgCodes: item.uasgCodes,
    valorMin: item.valorMin,
    valorMax: item.valorMax,
    raioKm: item.raioKm,
    origemLat: item.origemLat,
    origemLng: item.origemLng,
  }

  const patterns = compileKeywordPatterns(item.keywords)
  const results: RematchCandidate[] = []

  // Paginado por cursor: mesmo com o recorte no banco, uma palavra-chave muito
  // genérica pode devolver muita linha, e carregar tudo de uma vez dentro de
  // uma requisição HTTP é exatamente o que derrubava o contêiner.
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
      if (!passaNosPortoes(gates, tenderGateInput(t))) continue

      const objetoNorm = t.objetoNorm ?? normalize(t.objeto)
      const itemDescsNorm = t.items.map((i) => i.descricaoNorm ?? normalize(i.descricao))

      const encontradas = matchedKeywords(patterns, objetoNorm, itemDescsNorm)
      const codeMatch = temCodigoEmComum(t, item.catmatCodes, item.catserCodes)

      if (encontradas.length === 0 && !codeMatch) continue

      results.push({ tenderId: t.id, score: scoreDoMatch(codeMatch), matchedKeywords: encontradas })
    }

    if (lote.length < REMATCH_BATCH_SIZE) break
    cursor = lote[lote.length - 1].id
  }

  return results
}
