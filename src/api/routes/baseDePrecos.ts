// ============================================================
// api/routes/baseDePrecos.ts — Base de preços da empresa (Agente de Orçamento),
// atrás de requireAuth. CRUD + importar/exportar planilha. Tudo por companyId.
// ============================================================

import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter, exportacaoPlanilhaLimiter } from '../rateLimit'
import { responderComPlanilha } from '../respostaDePlanilha'
import { registrarAuditoria } from '../../services/auditService'
import {
  TIPOS_DE_CUSTO,
  FONTES_DE_PRECO,
  listarPrecos,
  criarPreco,
  atualizarPreco,
  removerPreco,
  exportarPlanilha,
  importarPlanilha,
  ImportacaoInvalida,
} from '../../services/baseDePrecos'

export const baseDePrecosRouter = Router()

const salvarSchema = z.object({
  descricao: z.string().trim().min(1).max(500),
  unidade: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((v) => v || null),
  tipo: z.enum(TIPOS_DE_CUSTO),
  custoUnitario: z.number().nonnegative().max(99_999_999_999.99),
  fonte: z.enum(FONTES_DE_PRECO).default('PROPRIA'),
  observacao: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null),
  dataDoPreco: z.coerce.date().optional(),
})

const buscaSchema = z.object({ q: z.string().trim().max(200).optional() })

baseDePrecosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q } = buscaSchema.parse(req.query)
    res.json(await listarPrecos(req.companyId!, q))
  })
)

baseDePrecosRouter.post(
  '/',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const dados = salvarSchema.parse(req.body)
    const criado = await criarPreco(req.companyId!, req.userId!, { ...dados, dataDoPreco: dados.dataDoPreco ?? new Date() })
    res.status(201).json(criado)
  })
)

baseDePrecosRouter.put(
  '/:id',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const dados = salvarSchema.parse(req.body)
    const atualizado = await atualizarPreco(req.companyId!, req.params.id, { ...dados, dataDoPreco: dados.dataDoPreco ?? new Date() })
    if (!atualizado) throw new ApiError(404, 'Preço não encontrado')
    res.json(atualizado)
  })
)

baseDePrecosRouter.delete(
  '/:id',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    await removerPreco(req.companyId!, req.params.id)
    res.status(204).end()
  })
)

baseDePrecosRouter.get(
  '/exportar',
  exportacaoPlanilhaLimiter,
  asyncHandler(async (req, res) => {
    const planilha = await exportarPlanilha(req.companyId!)
    const precos = await listarPrecos(req.companyId!)
    await responderComPlanilha(req, res, 'base-de-precos', precos.length, planilha)
  })
)

const lerArquivo = express.raw({ type: () => true, limit: 5 * 1024 * 1024 })

baseDePrecosRouter.post(
  '/importar',
  escritaSensivelLimiter,
  lerArquivo,
  asyncHandler(async (req, res) => {
    const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (conteudo.length === 0) throw new ApiError(400, 'Nenhuma planilha foi enviada')
    try {
      const resultado = await importarPlanilha(req.companyId!, req.userId!, conteudo)
      await registrarAuditoria(req, { action: 'BASE_PRECO_IMPORTADA', entityType: 'empresa', entityId: req.companyId!, metadata: { importados: resultado.importados, ignorados: resultado.ignorados } })
      res.json(resultado)
    } catch (err) {
      if (err instanceof ImportacaoInvalida) throw new ApiError(422, err.message)
      throw err
    }
  })
)
