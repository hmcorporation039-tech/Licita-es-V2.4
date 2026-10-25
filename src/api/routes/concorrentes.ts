// ============================================================
// api/routes/concorrentes.ts — Estrategista de Habilitação (fatia 1, base),
// atrás de requireAuth. Cria a análise de um concorrente, sobe os documentos e
// lista/remove. A análise por IA entra na fatia seguinte. Tudo por companyId.
// ============================================================

import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter } from '../rateLimit'
import { prisma } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import {
  adicionarArquivo,
  ArquivoInvalido,
  criarAnalise,
  LimiteDeArquivos,
  listarAnalises,
  obterAnalise,
  removerAnalise,
  TAMANHO_MAXIMO_ARQUIVO,
} from '../../services/analiseDeConcorrente'

export const concorrentesRouter = Router()

const listarSchema = z.object({ tenderId: z.string().min(1).max(80) })
const criarSchema = z.object({
  tenderId: z.string().min(1).max(80),
  nomeConcorrente: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
})

concorrentesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { tenderId } = listarSchema.parse(req.query)
    res.json(await listarAnalises(req.companyId!, tenderId))
  })
)

concorrentesRouter.post(
  '/',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const { tenderId, nomeConcorrente } = criarSchema.parse(req.body)
    const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')
    const criada = await criarAnalise(req.companyId!, req.userId!, tenderId, nomeConcorrente)
    await registrarAuditoria(req, { action: 'CONCORRENTE_ANALISE_CRIADA', entityType: 'licitacao', entityId: tenderId, metadata: { analiseId: criada.id } })
    res.status(201).json(criada)
  })
)

concorrentesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const analise = await obterAnalise(req.companyId!, req.params.id)
    if (!analise) throw new ApiError(404, 'Análise não encontrada')
    res.json(analise)
  })
)

concorrentesRouter.delete(
  '/:id',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    await removerAnalise(req.companyId!, req.params.id)
    await registrarAuditoria(req, { action: 'CONCORRENTE_ANALISE_REMOVIDA', entityType: 'concorrente', entityId: req.params.id })
    res.status(204).end()
  })
)

const lerArquivo = express.raw({ type: () => true, limit: TAMANHO_MAXIMO_ARQUIVO })

concorrentesRouter.post(
  '/:id/arquivos',
  escritaSensivelLimiter,
  lerArquivo,
  asyncHandler(async (req, res) => {
    const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    try {
      const atualizada = await adicionarArquivo(req.companyId!, req.params.id, conteudo)
      await registrarAuditoria(req, { action: 'CONCORRENTE_ARQUIVO_ENVIADO', entityType: 'concorrente', entityId: req.params.id })
      res.status(201).json(atualizada)
    } catch (err) {
      if (err instanceof LimiteDeArquivos) throw new ApiError(422, err.message)
      if (err instanceof ArquivoInvalido) throw new ApiError(err.message.includes('não encontrada') ? 404 : 415, err.message)
      throw err
    }
  })
)
