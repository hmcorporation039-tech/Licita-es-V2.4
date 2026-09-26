// ============================================================
// api/routes/companyDocuments.ts — Cofre de documentos da empresa
// Documentos cadastrados uma vez (não por licitação), cruzados
// automaticamente com o checklist de cada licitação pelo campo `tipo`.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'

export const companyDocumentsRouter = Router()

const createSchema = z.object({
  tipo: z.string().min(1).nullable().optional(),
  nome: z.string().min(1),
  dataEmissao: z.coerce.date().nullable().optional(),
  dataValidade: z.coerce.date().nullable().optional(),
  observacao: z.string().nullable().optional(),
})

const updateSchema = createSchema.partial()

async function assertOwnership(docId: string, userId: string) {
  const doc = await prisma.companyDocument.findUnique({ where: { id: docId } })
  if (!doc) throw new ApiError(404, 'Documento não encontrado')
  if (doc.userId !== userId) throw new ApiError(403, 'Este documento não pertence a você')
  return doc
}

companyDocumentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body)
    const doc = await prisma.companyDocument.create({ data: { ...body, userId: req.userId! } })
    res.status(201).json(doc)
  })
)

companyDocumentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await prisma.companyDocument.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    })
    res.json(docs)
  })
)

companyDocumentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwnership(req.params.id, req.userId!)

    const data = updateSchema.parse(req.body)
    const updated = await prisma.companyDocument.update({ where: { id: req.params.id }, data })
    res.json(updated)
  })
)

companyDocumentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwnership(req.params.id, req.userId!)

    await prisma.companyDocument.delete({ where: { id: req.params.id } })
    res.status(204).send()
  })
)
