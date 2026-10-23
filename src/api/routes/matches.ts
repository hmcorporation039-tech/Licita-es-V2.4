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
import { misturarPorFonte } from '../../lib/misturaDeFontes'
import { exportacaoPlanilhaLimiter } from '../rateLimit'
import { gerarPlanilhaXlsx } from '../../lib/planilhaXlsx'
import {
  CAMPOS_DA_LICITACAO_NA_PLANILHA,
  COLUNAS_DOS_MATCHES,
  TETO_DE_LINHAS_DA_PLANILHA,
  agruparMatchesPorLicitacao,
  avisoDeListaCortada,
  linhaDoMatch,
} from '../../lib/planilhasDaEmpresa'
import { linkDaLicitacaoNoMonitor } from '../../services/emailService'
import { responderComPlanilha } from '../respostaDePlanilha'

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
  tender: { select: { fonte: true, uf: true, valorEstimado: true, encerramentoAt: true, municipioLat: true, municipioLng: true } },
  monitoredItem: { select: { keywords: true, ufs: true, valorMin: true, valorMax: true, raioKm: true, origemLat: true, origemLng: true } },
} satisfies Prisma.TenderMatchSelect

type MatchParaNota = Prisma.TenderMatchGetPayload<{ select: typeof CAMPOS_DA_NOTA }>
type MatchComTudo = Prisma.TenderMatchGetPayload<{ include: { tender: { select: typeof TENDER_PUBLICO }; monitoredItem: true } }>

// Teto de matches considerados ao ordenar por nota (o feed já é recortado pela
// janela de prazo, então na prática fica muito abaixo disso).
export const LIMITE_ORDENACAO_POR_NOTA = 5000

const ORDEM_DA_AMOSTRA_POR_NOTA: Prisma.TenderMatchOrderByWithRelationInput[] = [
  { dentroDeObraCompleta: 'asc' },
  { tender: { encerramentoAt: { sort: 'asc', nulls: 'last' } } },
  { createdAt: 'desc' },
  { id: 'asc' },
]

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
    let ordenacaoPorNotaLimitadaA: number | null = null
    let totalPaginavel: number

    if (ordem === 'nota') {
      // A nota depende do tempo (o critério "Prazo" muda a cada dia), então ela
      // não é ordenável no banco: calcula só sobre os campos necessários de todos
      // os matches do recorte (limitado) e pagina em memória.
      const [leves, contagem] = await Promise.all([
        prisma.tenderMatch.findMany({
          where,
          orderBy: ORDEM_DA_AMOSTRA_POR_NOTA,
          take: LIMITE_ORDENACAO_POR_NOTA,
          select: { id: true, createdAt: true, ...CAMPOS_DA_NOTA },
        }),
        prisma.tenderMatch.count({ where }),
      ])
      const ordenados = leves
        .map((m) => ({ id: m.id, createdAt: m.createdAt, fonte: m.tender.fonte, nota: aderenciaDoMatch(m).nota }))
        .sort((a, b) => b.nota - a.nota || b.createdAt.getTime() - a.createdAt.getTime())
      const misturados = misturarPorFonte(ordenados, (o) => o.fonte === 'PNCP')
      total = contagem
      totalPaginavel = misturados.length
      if (contagem > LIMITE_ORDENACAO_POR_NOTA) ordenacaoPorNotaLimitadaA = LIMITE_ORDENACAO_POR_NOTA
      const ids = misturados.slice((page - 1) * pageSize, page * pageSize).map((o) => o.id)
      const completos = await prisma.tenderMatch.findMany({
        where: { id: { in: ids } },
        include: { tender: { select: TENDER_PUBLICO }, monitoredItem: true },
      })
      const porId = new Map(completos.map((m) => [m.id, m]))
      items = ids.map((id) => porId.get(id)).filter((m): m is MatchComTudo => m !== undefined)
    } else {
      const [leves, contagem] = await Promise.all([
        prisma.tenderMatch.findMany({
          where,
          orderBy: [{ dentroDeObraCompleta: 'asc' }, { createdAt: 'desc' }],
          select: { id: true, dentroDeObraCompleta: true, tender: { select: { fonte: true } } },
        }),
        prisma.tenderMatch.count({ where }),
      ])
      const ehPncp = (m: (typeof leves)[number]) => m.tender.fonte === 'PNCP'
      const ordenados = [
        ...misturarPorFonte(
          leves.filter((m) => !m.dentroDeObraCompleta),
          ehPncp
        ),
        ...misturarPorFonte(
          leves.filter((m) => m.dentroDeObraCompleta),
          ehPncp
        ),
      ]
      total = contagem
      totalPaginavel = ordenados.length
      const ids = ordenados.slice((page - 1) * pageSize, page * pageSize).map((m) => m.id)
      const completos = await prisma.tenderMatch.findMany({
        where: { id: { in: ids } },
        include: { tender: { select: TENDER_PUBLICO }, monitoredItem: true },
      })
      const porId = new Map(completos.map((m) => [m.id, m]))
      items = ids.map((id) => porId.get(id)).filter((m): m is MatchComTudo => m !== undefined)
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
      totalPages: Math.max(1, Math.ceil(totalPaginavel / pageSize)),
      ordenacaoPorNotaLimitadaA,
    })
  })
)

export const TETO_DE_MATCHES_LIDOS_NA_EXPORTACAO = 50_000

matchesRouter.get(
  '/exportar',
  exportacaoPlanilhaLimiter,
  asyncHandler(async (req, res) => {
    const matches = await prisma.tenderMatch.findMany({
      where: { companyId: req.companyId!, tender: whereDaLicitacaoNoFeed() },
      orderBy: ORDEM_DA_AMOSTRA_POR_NOTA,
      take: TETO_DE_MATCHES_LIDOS_NA_EXPORTACAO,
      select: {
        tenderId: true,
        ...CAMPOS_DA_NOTA,
        tender: { select: { ...CAMPOS_DA_NOTA.tender.select, fonte: true, aberturaAt: true } },
        monitoredItem: { select: { ...CAMPOS_DA_NOTA.monitoredItem.select, name: true } },
      },
    })
    const grupos = agruparMatchesPorLicitacao(
      matches.map((m) => ({
        tenderId: m.tenderId,
        nomeDoItem: m.monitoredItem.name,
        dentroDeObraCompleta: m.dentroDeObraCompleta,
        nota: aderenciaDoMatch(m).nota,
        datas: m.tender,
      }))
    )
    const selecionados = grupos.slice(0, TETO_DE_LINHAS_DA_PLANILHA)
    const cortada = grupos.length > selecionados.length || matches.length >= TETO_DE_MATCHES_LIDOS_NA_EXPORTACAO
    const licitacoes = await prisma.tender.findMany({
      where: { id: { in: selecionados.map((g) => g.tenderId) } },
      select: CAMPOS_DA_LICITACAO_NA_PLANILHA,
    })
    const porId = new Map(licitacoes.map((t) => [t.id, t]))
    const linhas = selecionados.flatMap((grupo) => {
      const licitacao = porId.get(grupo.tenderId)
      return licitacao ? [linhaDoMatch(grupo, licitacao, linkDaLicitacaoNoMonitor(licitacao.id))] : []
    })
    const planilha = gerarPlanilhaXlsx({
      nomeDaAba: 'Meus matches',
      colunas: COLUNAS_DOS_MATCHES,
      linhas,
      observacaoFinal: cortada ? avisoDeListaCortada(linhas.length, 'prazo mais próximo') : undefined,
    })
    await responderComPlanilha(req, res, 'matches', linhas.length, planilha)
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
