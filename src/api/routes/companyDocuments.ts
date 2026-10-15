// ============================================================
// api/routes/companyDocuments.ts — Cofre de documentos da empresa
// Documentos cadastrados uma vez (não por licitação), cruzados
// automaticamente com o checklist de cada licitação pelo campo `tipo`.
// ============================================================

import express, { Router } from 'express'
import { createHash } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter } from '../rateLimit'
import {
  TAMANHO_MAXIMO_ARQUIVO,
  detectarTipoDeArquivo,
  limiteDeArmazenamentoPorEmpresa,
  nomeDeArquivoSeguro,
} from '../../lib/arquivoDeDocumento'

const MAX_DOCUMENTOS_POR_EMPRESA = 300

export const companyDocumentsRouter = Router()

const createSchema = z.object({
  tipo: z.string().min(1).max(120).nullable().optional(),
  nome: z.string().min(1).max(200),
  dataEmissao: z.coerce.date().nullable().optional(),
  dataValidade: z.coerce.date().nullable().optional(),
  observacao: z.string().max(2000).nullable().optional(),
})

const updateSchema = createSchema.partial()

async function assertOwnership(docId: string, companyId: string) {
  const doc = await prisma.companyDocument.findUnique({ where: { id: docId } })
  if (!doc) throw new ApiError(404, 'Documento não encontrado')
  if (doc.companyId !== companyId) throw new ApiError(403, 'Este documento não pertence a você')
  return doc
}

companyDocumentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body)
    // Teto por empresa: um teste grátis do cadastro público não pode criar linhas sem fim.
    if ((await prisma.companyDocument.count({ where: { companyId: req.companyId! } })) >= MAX_DOCUMENTOS_POR_EMPRESA) {
      throw new ApiError(422, `Limite de ${MAX_DOCUMENTOS_POR_EMPRESA} documentos por empresa atingido. Remova algum para cadastrar outro.`)
    }
    const doc = await prisma.companyDocument.create({
      data: { ...body, companyId: req.companyId!, userId: req.userId! },
    })
    await registrarAuditoria(req, {
      action: 'DOCUMENTO_CRIADO',
      entityType: 'documento',
      entityId: doc.id,
      metadata: { nome: doc.nome, tipo: doc.tipo },
    })
    res.status(201).json(doc)
  })
)

companyDocumentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: req.companyId! },
      orderBy: { createdAt: 'desc' },
      include: { arquivo: { select: { nomeArquivo: true, mimeType: true, tamanho: true, updatedAt: true } } },
    })
    res.json(docs)
  })
)

companyDocumentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwnership(req.params.id, req.companyId!)

    const data = updateSchema.parse(req.body)
    const updated = await prisma.companyDocument.update({ where: { id: req.params.id }, data })
    await registrarAuditoria(req, {
      action: 'DOCUMENTO_ALTERADO',
      entityType: 'documento',
      entityId: updated.id,
      metadata: { campos: Object.keys(data) },
    })
    res.json(updated)
  })
)

companyDocumentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await assertOwnership(req.params.id, req.companyId!)

    await prisma.companyDocument.delete({ where: { id: req.params.id } })
    await registrarAuditoria(req, {
      action: 'DOCUMENTO_REMOVIDO',
      entityType: 'documento',
      entityId: doc.id,
      metadata: { nome: doc.nome, tipo: doc.tipo },
    })
    res.status(204).send()
  })
)

function nomeDoCabecalho(valor: string | undefined): string {
  try {
    return decodeURIComponent(valor ?? '')
  } catch {
    return ''
  }
}

const lerArquivo = express.raw({ type: () => true, limit: TAMANHO_MAXIMO_ARQUIVO })

companyDocumentsRouter.put(
  '/:id/arquivo',
  escritaSensivelLimiter,
  lerArquivo,
  asyncHandler(async (req, res) => {
    const doc = await assertOwnership(req.params.id, req.companyId!)
    const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (conteudo.length === 0) throw new ApiError(400, 'Nenhum arquivo foi enviado')

    const tipo = detectarTipoDeArquivo(conteudo)
    if (!tipo) throw new ApiError(415, 'Envie o documento em PDF, JPG ou PNG')

    const atual = await prisma.companyDocumentFile.findUnique({ where: { documentId: doc.id }, select: { tamanho: true } })
    const usado = await prisma.companyDocumentFile.aggregate({ where: { companyId: req.companyId! }, _sum: { tamanho: true } })
    const limite = limiteDeArmazenamentoPorEmpresa()
    if ((usado._sum.tamanho ?? 0) - (atual?.tamanho ?? 0) + conteudo.length > limite) {
      throw new ApiError(422, `O espaço de arquivos da empresa (${Math.round(limite / 1024 / 1024)} MB) acabou. Remova arquivos antigos para enviar este.`)
    }

    const nomeRecebido = nomeDoCabecalho(req.header('x-nome-arquivo')).slice(0, 200)
    const dados = {
      nomeArquivo: nomeDeArquivoSeguro(nomeRecebido, tipo),
      mimeType: tipo,
      tamanho: conteudo.length,
      sha256: createHash('sha256').update(conteudo).digest('hex'),
      conteudo,
    }
    const arquivo = await prisma.companyDocumentFile.upsert({
      where: { documentId: doc.id },
      update: dados,
      create: { ...dados, documentId: doc.id, companyId: req.companyId! },
      select: { nomeArquivo: true, mimeType: true, tamanho: true, updatedAt: true },
    })
    await registrarAuditoria(req, {
      action: atual ? 'DOCUMENTO_ARQUIVO_TROCADO' : 'DOCUMENTO_ARQUIVO_ENVIADO',
      entityType: 'documento',
      entityId: doc.id,
      metadata: { nome: doc.nome, arquivo: arquivo.nomeArquivo, tamanho: arquivo.tamanho, sha256: dados.sha256 },
    })
    res.json(arquivo)
  })
)

companyDocumentsRouter.get(
  '/:id/arquivo',
  asyncHandler(async (req, res) => {
    const doc = await assertOwnership(req.params.id, req.companyId!)
    const arquivo = await prisma.companyDocumentFile.findUnique({ where: { documentId: doc.id } })
    if (!arquivo) throw new ApiError(404, 'Este documento não tem arquivo anexado')

    res.setHeader('Content-Type', arquivo.mimeType)
    res.setHeader('Content-Length', String(arquivo.tamanho))
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(arquivo.nomeArquivo)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(Buffer.from(arquivo.conteudo))
  })
)

companyDocumentsRouter.delete(
  '/:id/arquivo',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const doc = await assertOwnership(req.params.id, req.companyId!)
    const { count } = await prisma.companyDocumentFile.deleteMany({ where: { documentId: doc.id } })
    if (count === 0) throw new ApiError(404, 'Este documento não tem arquivo anexado')
    await registrarAuditoria(req, {
      action: 'DOCUMENTO_ARQUIVO_REMOVIDO',
      entityType: 'documento',
      entityId: doc.id,
      metadata: { nome: doc.nome },
    })
    res.status(204).send()
  })
)
