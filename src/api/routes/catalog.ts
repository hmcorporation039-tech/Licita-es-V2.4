// ============================================================
// api/routes/catalog.ts — Autocomplete de códigos de catálogo (CATMAT/CATSER)
// no cadastro de item monitorado. Lê o cache local (tabela CatalogItem),
// populado por scripts/importCatalogo.ts.
// ============================================================

import { Router } from 'express'
import { CatalogoTipo } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { normalize } from '../../lib/geoService'
import { asyncHandler } from '../asyncHandler'

export const catalogRouter = Router()

const querySchema = z.object({
  tipo: z.enum(['material', 'servico']),
  q: z.string().trim().min(2).max(120),
})

catalogRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { tipo, q } = querySchema.parse(req.query)
    const tipoEnum: CatalogoTipo = tipo === 'material' ? 'MATERIAL' : 'SERVICO'
    const qNorm = normalize(q)
    const soDigitos = q.replace(/\D/g, '')

    const rows = await prisma.catalogItem.findMany({
      where: {
        tipo: tipoEnum,
        ativo: true,
        OR: [
          { descricaoNorm: { contains: qNorm } },
          // Também permite achar pelo próprio código digitado.
          ...(soDigitos.length >= 2 ? [{ codigo: { startsWith: soDigitos } }] : []),
        ],
      },
      take: 20,
      orderBy: { descricao: 'asc' },
      select: { codigo: true, descricao: true, grupo: true, classe: true },
    })

    res.json(rows)
  })
)
