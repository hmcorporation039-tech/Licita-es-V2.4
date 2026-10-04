// ============================================================
// api/routes/matches.ts — Feed de matches (licitação x item monitorado)
// ============================================================

import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { Aderencia, calcularAderencia } from '../../lib/aderencia'

export const matchesRouter = Router()

// Teto GLOBAL de dias até o encerramento da proposta. Uma proposta que só
// encerra daqui a muito tempo (ou já encerrou) é descartada do pool por padrão
// — instruções 3.1.1 (prazo > 30/60 dias) e 3.1.2 (data já vencida). Ajustável
// por COLETA_PRAZO_MAX_DIAS no .env (padrão 30).
const PRAZO_MAX_DIAS = Number(process.env.COLETA_PRAZO_MAX_DIAS ?? 30)

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
  tender: { select: { uf: true, valorEstimado: true, encerramentoAt: true, municipioLat: true, municipioLng: true } },
  monitoredItem: { select: { keywords: true, ufs: true, valorMin: true, valorMax: true, raioKm: true, origemLat: true, origemLng: true } },
} satisfies Prisma.TenderMatchSelect

type MatchParaNota = Prisma.TenderMatchGetPayload<{ select: typeof CAMPOS_DA_NOTA }>
type MatchComTudo = Prisma.TenderMatchGetPayload<{ include: { tender: true; monitoredItem: true } }>

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

// Situações em que a licitação deixou de ser oportunidade viável — ocultadas
// por padrão no feed de matches (instruções 3.1.4/3.1.5).
const SITUACOES_INATIVAS = ['REVOGADA', 'SUSPENSA', 'ANULADA', 'CANCELADA'] as const

matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { unreadOnly, incluirInativas, incluirForaDoPrazo, ordem, page, pageSize } = querySchema.parse(req.query)

    // Recorte no nível da licitação relacionada ao match.
    const tenderWhere: Prisma.TenderWhereInput = {}
    if (!incluirInativas) tenderWhere.situacao = { notIn: [...SITUACOES_INATIVAS] }
    if (!incluirForaDoPrazo) {
      const agora = new Date()
      const limite = new Date(Date.now() + PRAZO_MAX_DIAS * 24 * 60 * 60 * 1000)
      // Pendente de publicação (3.1.3): sem data de publicação, fica de fora.
      tenderWhere.publicadoAt = { not: null }
      // Janela de proposta: sem data de encerramento (comum em dispensa) fica no
      // pool; com data, só se encerra de agora até o teto de dias (3.1.1/3.1.2).
      tenderWhere.OR = [
        { encerramentoAt: null },
        { encerramentoAt: { gte: agora, lte: limite } },
      ]
    }

    const where = {
      companyId: req.companyId!,
      ...(unreadOnly ? { read: false } : {}),
      ...(Object.keys(tenderWhere).length > 0 ? { tender: tenderWhere } : {}),
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
        include: { tender: true, monitoredItem: true },
      })
      const porId = new Map(completos.map((m) => [m.id, m]))
      items = ids.map((id) => porId.get(id)).filter((m): m is MatchComTudo => m !== undefined)
    } else {
      ;[items, total] = await Promise.all([
        prisma.tenderMatch.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tender: true, monitoredItem: true },
        }),
        prisma.tenderMatch.count({ where }),
      ])
    }

    res.json({
      items: items.map((m) => ({ ...m, aderencia: aderenciaDoMatch(m) })),
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
  asyncHandler(async (req, res) => {
    const { count } = await prisma.tenderMatch.deleteMany({ where: { companyId: req.companyId! } })
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
