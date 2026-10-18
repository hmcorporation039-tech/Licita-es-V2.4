// ============================================================
// api/routes/public.ts — Dados públicos (sem login) para a página inicial:
// os planos ativos e o que cada um inclui. Preço só aparece quando definido.
// ============================================================

import { Router } from 'express'
import { prisma } from '../../services/tenderService'
import { asyncHandler } from '../asyncHandler'
import { lerLimites } from '../../lib/planos'
import { trialDias } from '../../services/contaService'
import { TERMOS_VERSAO } from '../../lib/legal'
import { z } from 'zod'
import { normalize } from '../../lib/geoService'
import { whereLicitacaoComPrazoConfirmado } from '../../lib/licitacaoAberta'
import { dataDaSessao } from '../../lib/dataDaSessao'
import { vitrineLimiter } from '../rateLimit'
import { idsQueCitamOTexto } from '../../services/buscaDeLicitacoes'
import { Prisma } from '@prisma/client'

export const publicRouter = Router()

publicRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json({
      trialDias: trialDias(),
      termosVersao: TERMOS_VERSAO,
      planos: plans.map((p) => ({
        codigo: p.code,
        nome: p.name,
        descricao: p.description,
        limites: lerLimites(p.limits),
        precoMensalCentavos: p.priceMonthlyCents,
        precoAnualCentavos: p.priceYearlyCents,
      })),
    })
  })
)

const DEZ_MINUTOS = 10 * 60 * 1000
const MAX_ENTRADAS_NO_CACHE = 500
const cacheDaVitrine = new Map<string, { expiraEm: number; valor: unknown }>()

function lerCache(chave: string): unknown | undefined {
  const item = cacheDaVitrine.get(chave)
  if (!item) return undefined
  if (item.expiraEm < Date.now()) {
    cacheDaVitrine.delete(chave)
    return undefined
  }
  return item.valor
}

function gravarCache(chave: string, valor: unknown) {
  if (cacheDaVitrine.size >= MAX_ENTRADAS_NO_CACHE) cacheDaVitrine.delete(cacheDaVitrine.keys().next().value as string)
  cacheDaVitrine.set(chave, { expiraEm: Date.now() + DEZ_MINUTOS, valor })
}

publicRouter.get(
  '/estatisticas',
  vitrineLimiter,
  asyncHandler(async (_req, res) => {
    const emCache = lerCache('estatisticas')
    if (emCache) {
      res.json(emCache)
      return
    }
    const [abertas, porFonte, ultimaColeta] = await Promise.all([
      prisma.tender.count({ where: whereLicitacaoComPrazoConfirmado() }),
      prisma.tender.groupBy({ by: ['fonte'], where: whereLicitacaoComPrazoConfirmado(), _count: { _all: true } }),
      prisma.workerLog.findFirst({ where: { status: { in: ['SUCCESS', 'PARTIAL'] }, finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
    ])
    const valor = { abertas, fontes: porFonte.filter((f) => f._count._all > 0).length, atualizadoEm: ultimaColeta?.finishedAt ?? null }
    gravarCache('estatisticas', valor)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(valor)
  })
)

const AMOSTRAS_DA_VITRINE = 3
const ORDEM_DA_VITRINE: Prisma.TenderOrderByWithRelationInput[] = [{ encerramentoAt: { sort: 'asc', nulls: 'last' } }, { aberturaAt: 'asc' }, { id: 'asc' }]

const vitrineSchema = z.object({
  q: z.string().trim().min(3).max(60),
  uf: z.string().trim().toUpperCase().length(2).optional(),
})

publicRouter.get(
  '/vitrine',
  vitrineLimiter,
  asyncHandler(async (req, res) => {
    const { q, uf } = vitrineSchema.parse(req.query)
    const qNorm = normalize(q)
    const chave = `vitrine:${qNorm}:${uf ?? ''}`
    const emCache = lerCache(chave)
    if (emCache) {
      res.json(emCache)
      return
    }
    const { ids } = await idsQueCitamOTexto(q, { AND: [whereLicitacaoComPrazoConfirmado(), ...(uf ? [{ uf }] : [])] }, ORDEM_DA_VITRINE)
    const total = ids.length
    const idsDasAmostras = ids.slice(0, AMOSTRAS_DA_VITRINE)
    const encontradas = await prisma.tender.findMany({
      where: { id: { in: idsDasAmostras } },
      select: { id: true, objeto: true, objetoResumido: true, orgao: true, uf: true, municipio: true, encerramentoAt: true, aberturaAt: true, fonte: true },
    })
    const porId = new Map(encontradas.map((t) => [t.id, t]))
    const amostras = idsDasAmostras.map((id) => porId.get(id)).filter((t): t is (typeof encontradas)[number] => t !== undefined)
    const valor = {
      total,
      amostras: amostras.map((t) => {
        const objeto = (t.objetoResumido ?? t.objeto).replace(/\s+/g, ' ').trim()
        return {
          objeto: objeto.length > 140 ? `${objeto.slice(0, 137)}...` : objeto,
          orgao: t.orgao,
          local: [t.municipio, t.uf].filter(Boolean).join('/'),
          prazo: dataDaSessao(t),
          fonte: t.fonte,
        }
      }),
    }
    gravarCache(chave, valor)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(valor)
  })
)

