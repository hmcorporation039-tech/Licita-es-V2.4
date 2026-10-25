// ============================================================
// api/routes/concorrentes.ts — Estrategista de Habilitação (fatia 1, base),
// atrás de requireAuth. Cria a análise de um concorrente, sobe os documentos e
// lista/remove. A análise por IA entra na fatia seguinte. Tudo por companyId.
// ============================================================

import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter, estudoPdfLimiter } from '../rateLimit'
import { prisma } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import { exigirCotaDaRequisicao } from '../cotas'
import { analiseQueue } from '../../queues'
import { enfileirarSemTravar } from '../../queues/enfileirar'
import { documentoSchema } from '../../lib/documentosDaLicitacao/modelo'
import { recursoDeHabilitacao, type AchadoDoRecurso } from '../../lib/documentosDaLicitacao/recurso'
import { carregarCertameParaDocumento, carregarTimbrado } from './documentosDaLicitacao'
import { renderizarPdf } from '../../services/documentos/renderizarPdf'
import { renderizarDocx } from '../../services/documentos/renderizarDocx'
import {
  adicionarArquivo,
  ArquivoInvalido,
  criarAnalise,
  LimiteDeArquivos,
  listarAnalises,
  marcarAnaliseEmAndamento,
  obterAnalise,
  removerAnalise,
  reverterAnaliseParaPendente,
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

// Dispara a análise por IA (roda na fila 'analise'). A cota é conferida antes de
// reservar: a reserva (status RUNNING) já conta como "em andamento" na própria cota.
concorrentesRouter.post(
  '/:id/analisar',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const analise = await obterAnalise(req.companyId!, req.params.id)
    if (!analise) throw new ApiError(404, 'Análise não encontrada')
    if (analise.arquivos.length === 0) throw new ApiError(400, 'Envie ao menos um documento do concorrente antes de analisar.')

    await exigirCotaDaRequisicao(req, 'analisesDeConcorrenteMes')
    await marcarAnaliseEmAndamento(req.companyId!, req.params.id)
    await registrarAuditoria(req, { action: 'CONCORRENTE_ANALISE_SOLICITADA', entityType: 'concorrente', entityId: req.params.id })

    const enfileirou = await enfileirarSemTravar(
      analiseQueue,
      'analisar-concorrente',
      { analiseId: req.params.id, companyId: req.companyId!, userId: req.userId! },
      'Análise de concorrente',
      { deduplication: { id: `concorrente-${req.params.id}` } }
    )
    if (!enfileirou) {
      await reverterAnaliseParaPendente(req.companyId!, req.params.id)
      throw new ApiError(503, 'A fila de análise está indisponível no momento — tente de novo em alguns minutos')
    }

    res.status(202).json(await obterAnalise(req.companyId!, req.params.id))
  })
)

// ------------------------------------------------------------
// Minuta de recurso (fatia 2): monta o recurso contra a habilitação do
// concorrente a partir dos achados e renderiza no papel timbrado da empresa.
// Reusa o proponente/certame e os renderizadores de documentosDaLicitacao.
// ------------------------------------------------------------

function achadosQueSustentam(resultado: unknown): AchadoDoRecurso[] {
  const achados = (resultado as { achados?: AchadoDoRecurso[] } | null)?.achados
  if (!Array.isArray(achados)) return []
  return achados.filter((a) => a && (a.situacao === 'nao_atende' || a.situacao === 'nao_comprovado'))
}

async function analiseComAchados(companyId: string, id: string) {
  const analise = await obterAnalise(companyId, id)
  if (!analise) throw new ApiError(404, 'Análise não encontrada')
  if (analise.status !== 'DONE') throw new ApiError(409, 'Rode a análise do concorrente antes de gerar o recurso.')
  const achados = achadosQueSustentam(analise.resultado)
  if (achados.length === 0) throw new ApiError(409, 'A análise não apontou motivo de inabilitação — não há base para o recurso.')
  return { analise, achados }
}

concorrentesRouter.post(
  '/:id/recurso/previa',
  asyncHandler(async (req, res) => {
    const { analise, achados } = await analiseComAchados(req.companyId!, req.params.id)
    const [timbrado, certame] = await Promise.all([carregarTimbrado(req.companyId!), carregarCertameParaDocumento(analise.tenderId)])
    const r = recursoDeHabilitacao(timbrado.proponente, certame, analise.nomeConcorrente, achados)
    res.json({ ...r, temLogo: timbrado.logo !== null })
  })
)

const nomeDoRecurso = (nomeConcorrente: string | null, id: string, extensao: string) => {
  const base = `recurso-${(nomeConcorrente || id)}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return `${base}.${extensao}`
}

const recursoArquivoSchema = z.object({ formato: z.enum(['pdf', 'docx']), documento: documentoSchema })

concorrentesRouter.post(
  '/:id/recurso/arquivo',
  estudoPdfLimiter,
  asyncHandler(async (req, res) => {
    const { formato, documento } = recursoArquivoSchema.parse(req.body)
    // Confere que a análise é desta empresa (isolamento) antes de gerar o arquivo.
    const analise = await obterAnalise(req.companyId!, req.params.id)
    if (!analise) throw new ApiError(404, 'Análise não encontrada')

    const timbrado = await carregarTimbrado(req.companyId!)
    const arquivo = formato === 'pdf' ? await renderizarPdf(documento, timbrado) : await renderizarDocx(documento, timbrado)
    await registrarAuditoria(req, { action: 'DOCUMENTO_GERADO', entityType: 'concorrente', entityId: req.params.id, metadata: { tipo: 'recurso', formato } })

    res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${nomeDoRecurso(analise.nomeConcorrente, req.params.id.slice(0, 8), formato)}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(arquivo)
  })
)
