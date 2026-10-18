// ============================================================
// api/routes/matches.ts — Feed de matches (licitação x item monitorado)
// ============================================================

import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { requireCompanyOwner } from '../authMiddleware'
import { registrarAuditoria } from '../../services/auditService'
import { whereDaLicitacaoNoFeed } from '../../lib/feedDeMatches'
import { TENDER_PUBLICO } from '../../lib/tenderPublico'
import { Aderencia, calcularAderencia } from '../../lib/aderencia'

export const matchesRouter = Router()

const querySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Por padrão o feed esconde licitação que morreu depois do match
  // (revogada/suspensa/anulada/cancelada). incluirInativas=true mostra tudo.
  incluirInativas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Por padrão o feed também esconde o que está fora da janela de proposta
  // (não publicado, já encerrado, ou encerrando depois do teto de dias).
  // incluirForaDoPrazo=true desliga esse recorte.
  incluirForaDoPrazo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // 'recentes' (padrão) ou 'nota' (maior nota de aderência primeiro).
  ordem: z.enum(['recentes', 'nota']).default('recentes'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

// Campos mínimos para calcular a nota de aderência de um match.
const CAMPOS_DA_NOTA = {
  matchedByCode: true,
  matchedKeywords: true,
  dentroDeObraCompleta: true,
  tender: { select: { uf: true, valorEstimado: true, encerramentoAt: true, municipioLat: true, municipioLng: true } },
  monitoredItem: { select: { keywords: true, ufs: true, valorMin: true, valorMax: true, raioKm: true, origemLat: true, origemLng: true } },
} satisfies Prisma.TenderMatchSelect

type MatchParaNota = Prisma.TenderMatchGetPayload<{ select: typeof CAMPOS_DA_NOTA }>
type MatchComTudo = Prisma.TenderMatchGetPayload<{ include: { tender: { select: typeof TENDER_PUBLICO }; monitoredItem: true } }>

// Teto de matches considerados ao ordenar por nota (o feed já é recortado pela
// janela de prazo, então na prática fica muito abaixo disso).
const LIMITE_ORDENACAO_POR_NOTA = 5000

// Nota ao vivo (o prazo restante muda com o tempo), a partir do que o match guardou
// e do item/licitação de hoje.
function aderenciaDoMatch(m: MatchParaNota): Aderencia {
  return calcularAderencia({
    porCodigo: m.matchedByCode,
    palavrasEncontradas: m.matchedKeywords.length,
    palavrasTotal: m.monitoredItem.keywords.length,
    dentroDeObraCompleta: m.dentroDeObraCompleta,
    item: {
      ufs: m.monitoredItem.ufs,
      valorMin: m.monitoredItem.valorMin != null ? Number(m.monitoredItem.valorMin) : null,
      valorMax: m.monitoredItem.valorMax != null ? Number(m.monitoredItem.valorMax) : null,
      raioKm: m.monitoredItem.raioKm,
      origemLat: m.monitoredItem.origemLat,
      origemLng: m.monitoredItem.origemLng,
    },
    tender: {
      uf: m.tender.uf,
      valorEstimado: m.tender.valorEstimado != null ? Number(m.tender.valorEstimado) : null,
      encerramentoAt: m.tender.encerramentoAt,
      municipioLat: m.tender.municipioLat,
      municipioLng: m.tender.municipioLng,
    },
  })
}

matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { unreadOnly, incluirInativas, incluirForaDoPrazo, ordem, page, pageSize } = querySchema.parse(req.query)

    const where = {
      companyId: req.companyId!,
      ...(unreadOnly ? { read: false } : {}),
      tender: whereDaLicitacaoNoFeed({ incluirInativas, incluirForaDoPrazo }),
    }

    let items: MatchComTudo[]
    let total: number

    if (ordem === 'nota') {
      // A nota depende do tempo (o critério "Prazo" muda a cada dia), então ela
      // não é ordenável no banco: calcula só sobre os campos necessários de todos
      // os matches do recorte (limitado) e pagina em memória.
      const leves = await prisma.tenderMatch.findMany({
        where,
        take: LIMITE_ORDENACAO_POR_NOTA,
        select: { id: true, createdAt: true, ...CAMPOS_DA_NOTA },
      })
      const ordenados = leves
        .map((m) => ({ id: m.id, createdAt: m.createdAt, nota: aderenciaDoMatch(m).nota }))
        .sort((a, b) => b.nota - a.nota || b.createdAt.getTime() - a.createdAt.getTime())
      total = ordenados.length
      const ids = ordenados.slice((page - 1) * pageSize, page * pageSize).map((o) => o.id)
      const completos = await prisma.tenderMatch.findMany({
        where: { id: { in: ids } },
        include: { tender: { select: TENDER_PUBLICO }, monitoredItem: true },
      })
      const porId = new Map(completos.map((m) => [m.id, m]))
      items = ids.map((id) => porId.get(id)).filter((m): m is MatchComTudo => m !== undefined)
    } else {
      ;[items, total] = await Promise.all([
        prisma.tenderMatch.findMany({
          where,
          orderBy: [{ dentroDeObraCompleta: 'asc' }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tender: { select: TENDER_PUBLICO }, monitoredItem: true },
        }),
        prisma.tenderMatch.count({ where }),
      ])
    }

    const planosEscolhidos = await prisma.tenderParticipationPlan.findMany({
      where: { companyId: req.companyId!, tenderId: { in: items.map((m) => m.tenderId) }, status: 'VOU_PARTICIPAR' },
      select: { tenderId: true },
    })
    const escolhidas = new Set(planosEscolhidos.map((p) => p.tenderId))

    res.json({
      items: items.map((m) => ({ ...m, aderencia: aderenciaDoMatch(m), escolhida: escolhidas.has(m.tenderId) })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  })
)

// Apaga todos os matches da empresa de uma vez — útil pra "zerar" o feed
// e deixar só o que a coleta encontrar dali pra frente.
matchesRouter.delete(
  '/',
  requireCompanyOwner,
  asyncHandler(async (req, res) => {
    const { count } = await prisma.tenderMatch.deleteMany({ where: { companyId: req.companyId! } })
    await registrarAuditoria(req, { action: 'MATCHES_APAGADOS', entityType: 'empresa', entityId: req.companyId!, metadata: { total: count } })
    res.json({ deleted: count })
  })
)

matchesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const match = await prisma.tenderMatch.findUnique({ where: { id: req.params.id } })
    if (!match) throw new ApiError(404, 'Match não encontrado')
    if (match.companyId !== req.companyId) throw new ApiError(403, 'Este match não pertence a você')

    const read = typeof req.body?.read === 'boolean' ? req.body.read : undefined
    if (read === undefined) throw new ApiError(400, 'Campo read (boolean) é obrigatório')

    const updated = await prisma.tenderMatch.update({ where: { id: req.params.id }, data: { read } })
    res.json(updated)
  })
)
