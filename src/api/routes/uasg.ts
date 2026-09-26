// ============================================================
// api/routes/uasg.ts — Busca na tabela cacheada de UASGs (unidades
// compradoras), pra autocompletar o cadastro de item monitorado.
// Ver scripts/importUasg.ts (importação) e MonitoredItem.uasgCodes.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { normalize } from '../../lib/geoService'
import { asyncHandler } from '../asyncHandler'

export const uasgRouter = Router()

const querySchema = z.object({
  q: z.string().trim().min(2),
  uf: z.string().length(2).optional(),
})

uasgRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, uf } = querySchema.parse(req.query)
    const qNorm = normalize(q)

    const rows = await prisma.uasg.findMany({
      where: {
        ativo: true,
        ...(uf ? { siglaUf: uf.toUpperCase() } : {}),
        OR: [
          { nomeUasgNorm: { contains: qNorm } },
          { nomeOrgaoNorm: { contains: qNorm } },
          { codigoUasg: { contains: q.trim() } },
        ],
      },
      take: 20,
      orderBy: { nomeUasg: 'asc' },
      select: {
        codigoUasg: true,
        nomeUasg: true,
        nomeOrgao: true,
        siglaUf: true,
        municipioNome: true,
      },
    })

    res.json(rows)
  })
)

// Resolve códigos UASG já salvos num item monitorado pros dados de exibição
// (nome, órgão, UF) — usado ao abrir a edição de um item existente.
const byCodesSchema = z.object({ codes: z.string().min(1) })

uasgRouter.get(
  '/by-codes',
  asyncHandler(async (req, res) => {
    const { codes } = byCodesSchema.parse(req.query)
    const list = codes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    if (list.length === 0) {
      res.json([])
      return
    }

    const rows = await prisma.uasg.findMany({
      where: { codigoUasg: { in: list } },
      select: {
        codigoUasg: true,
        nomeUasg: true,
        nomeOrgao: true,
        siglaUf: true,
        municipioNome: true,
      },
    })
    res.json(rows)
  })
)
