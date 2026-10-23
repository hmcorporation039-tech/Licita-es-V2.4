// ============================================================
// api/routes/tenders.ts — Feed público de licitações coletadas
// ============================================================

import { Router, Request } from 'express'
import { ModalidadeEnum, Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma, garantirItensPNCP } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { escritaSensivelLimiter } from '../rateLimit'
import { buildChecklistTemplate, ChecklistItem } from '../../lib/checklistTemplate'
import { analiseHabilitada } from '../../services/editalAnalysisService'
import { analiseQueue } from '../../queues'
import { enfileirarSemTravar } from '../../queues/enfileirar'
import { MODALIDADE_VALUES } from './monitoredItems'
import { buildAutoMilestones, PlanMilestone } from '../../lib/participationPlanTemplate'
import { calcularPrazosDaSessao, lerDataTexto } from '../../lib/diasUteis'
import { exigirCotaDaRequisicao } from '../cotas'
import { registrarAuditoria } from '../../services/auditService'
import { avaliarHabilitacao } from '../../lib/habilitacao'
import { alertasDaAnalise } from '../../lib/alertasLegais'
import type { EditalAnalysisResult } from '../../services/llm/types'
import { chaveDaExigencia, ExigenciaVerificada, resumoDaVerificacao } from '../../lib/matrizExigencias'
import { analiseParaResposta } from '../../lib/analiseParaResposta'
import { whereLicitacaoAberta, whereLicitacaoComPrazoConfirmado } from '../../lib/licitacaoAberta'
import { idsQueCitamOTexto, whereDoMunicipio, whereDoNumeroDoEdital, whereDoOrgao } from '../../services/buscaDeLicitacoes'
import { fatiasDaPagina } from '../../lib/paginacaoEmGrupos'
import { TENDER_PUBLICO, semRawJson } from '../../lib/tenderPublico'
import { MAX_ANALISES_POR_HORA, pedidosDeAnaliseNaUltimaHora } from '../../services/quotaService'
import { desfazerReserva, reservarAnalise } from '../../services/reservaDeAnalise'
import { falhouHaPouco } from '../../lib/esperaDeReanalise'
import { dataDaSessao } from '../../lib/dataDaSessao'

import { SIGLAS_DAS_UFS } from '../../lib/origemDoCadastro'
import { temPalavraSignificativa } from '../../lib/matching'

export const MENSAGEM_DE_BUSCA_SEM_PALAVRA = 'Digite pelo menos uma palavra do que você procura, como "cimento" ou "merenda". Só "de", "para", "com" e afins não filtram nada.'

export const tendersRouter = Router()

const SITUACAO_VALUES = ['ABERTA', 'ENCERRADA', 'SUSPENSA', 'CANCELADA', 'ANULADA', 'HOMOLOGADA', 'REVOGADA'] as const

const querySchema = z.object({
  uf: z
    .string()
    .max(120)
    .transform((v) => [...new Set(v.toUpperCase().split(/[\s,;]+/).filter(Boolean))])
    .pipe(z.array(z.enum(SIGLAS_DAS_UFS)).max(SIGLAS_DAS_UFS.length))
    .optional(),
  modalidade: z
    .string()
    .max(400)
    .transform((v) => [...new Set(v.toUpperCase().split(/[\s,;]+/).filter(Boolean))])
    .pipe(z.array(z.enum(MODALIDADE_VALUES)).max(MODALIDADE_VALUES.length))
    .optional(),
  situacao: z.enum(SITUACAO_VALUES).optional(),
  orgao: z.string().trim().min(1).max(200).optional(),
  municipio: z.string().trim().min(1).max(200).optional(),
  // "Nº edital" no estilo BLL — busca pelo número de controle do PNCP/ComprasNet
  numero: z.string().trim().min(1).max(100).optional(),
  publicacaoInicio: z.coerce.date().optional(),
  publicacaoFim: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  // Quando true, restringe o feed às licitações que deram match com algum
  // item monitorado do usuário logado (em vez do feed público completo) —
  // o cruzamento em si é feito pelo matcher (casamento literal de palavra-
  // chave + código CATMAT/CATSER), aqui só filtramos e classificamos.
  somenteRelacionadas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Agrupa visualmente por Estado e depois por Órgão/Prefeitura, em vez do
  // feed cronológico padrão — muda só a ordenação; o agrupamento em si
  // (inserir os cabeçalhos de UF/Órgão) é feito no front, olhando pra
  // sequência já vindo ordenada assim.
  agrupar: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  agruparPor: z.enum(['estado', 'modalidade']).default('estado'),
  ordem: z.enum(['prazo', 'recentes']).default('prazo'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

type MatchDaLista = { score: number; matchedByCode: boolean; matchedKeywords: string[]; dentroDeObraCompleta: boolean; monitoredItem: { id: string; name: string } }

function ordemDaLista(agrupar: boolean, ordem: 'prazo' | 'recentes', agruparPor: 'estado' | 'modalidade'): Prisma.TenderOrderByWithRelationInput[] {
  return [
    ...(agrupar ? (agruparPor === 'modalidade' ? [{ modalidade: 'asc' as const }] : [{ uf: 'asc' as const }, { orgao: 'asc' as const }]) : []),
    ...(ordem === 'prazo'
      ? [{ encerramentoAt: { sort: 'asc' as const, nulls: 'last' as const } }, { aberturaAt: { sort: 'asc' as const, nulls: 'last' as const } }]
      : []),
    { publicadoAt: 'desc' as const },
    { id: 'asc' as const },
  ]
}

function gruposDaLista(where: Prisma.TenderWhereInput, companyId: string | undefined): Prisma.TenderWhereInput[] {
  if (!companyId) return [where]
  return [
    { AND: [where, { tenderMatches: { some: { companyId, dentroDeObraCompleta: false } } }] },
    { AND: [where, { tenderMatches: { some: { companyId }, none: { companyId, dentroDeObraCompleta: false } } }] },
  ]
}

tendersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      uf,
      modalidade,
      situacao,
      orgao,
      municipio,
      numero,
      publicacaoInicio,
      publicacaoFim,
      q,
      somenteRelacionadas,
      agrupar,
      agruparPor,
      ordem,
      page,
      pageSize,
    } = querySchema.parse(req.query)
    if (q && !temPalavraSignificativa(q)) throw new ApiError(400, MENSAGEM_DE_BUSCA_SEM_PALAVRA, { code: 'BUSCA_SEM_PALAVRA' })
    const companyId = somenteRelacionadas ? req.companyId! : undefined
    void situacao

    const condicoes: Prisma.TenderWhereInput[] = [whereLicitacaoAberta()]
    if (uf?.length) condicoes.push({ uf: uf.length === 1 ? uf[0] : { in: uf } })
    if (modalidade?.length) condicoes.push({ modalidade: modalidade.length === 1 ? (modalidade[0] as ModalidadeEnum) : { in: modalidade as ModalidadeEnum[] } })
    if (orgao) condicoes.push(whereDoOrgao(orgao))
    if (municipio) condicoes.push(whereDoMunicipio(municipio))
    if (numero) condicoes.push(whereDoNumeroDoEdital(numero))
    if (publicacaoInicio || publicacaoFim) {
      condicoes.push({
        publicadoAt: {
          ...(publicacaoInicio ? { gte: publicacaoInicio } : {}),
          ...(publicacaoFim ? { lte: publicacaoFim } : {}),
        },
      })
    }
    if (companyId) condicoes.push({ tenderMatches: { some: { companyId } } })
    const where: Prisma.TenderWhereInput = { AND: condicoes }

    const orderBy = ordemDaLista(agrupar, ordem, agruparPor)
    const grupos = gruposDaLista(where, companyId)
    const select = companyId
      ? { ...TENDER_PUBLICO, tenderMatches: { where: { companyId }, include: { monitoredItem: { select: { id: true, name: true } } } } }
      : TENDER_PUBLICO

    let rows: Record<string, unknown>[]
    let total: number
    let totais: { comPrazoConfirmado: number; semDataInformada: number } | undefined
    let buscaLimitada = false

    if (q) {
      const buscas = await Promise.all(grupos.map((g) => idsQueCitamOTexto(q, g, orderBy)))
      const ids = buscas.flatMap((b) => b.ids)
      buscaLimitada = buscas.some((b) => b.limitada)
      total = ids.length
      const idsDaPagina = ids.slice((page - 1) * pageSize, page * pageSize)
      const encontradas = await prisma.tender.findMany({ where: { id: { in: idsDaPagina } }, select })
      const porId = new Map(encontradas.map((t) => [t.id, t as Record<string, unknown>]))
      rows = idsDaPagina.map((id) => porId.get(id)).filter((t): t is Record<string, unknown> => t !== undefined)
    } else {
      const [totaisDosGrupos, comPrazoConfirmado] = await Promise.all([
        Promise.all(grupos.map((g) => prisma.tender.count({ where: g }))),
        prisma.tender.count({ where: { AND: [where, whereLicitacaoComPrazoConfirmado()] } }),
      ])
      total = totaisDosGrupos.reduce((soma, n) => soma + n, 0)
      totais = { comPrazoConfirmado, semDataInformada: Math.max(0, total - comPrazoConfirmado) }
      const fatias = fatiasDaPagina(totaisDosGrupos, page, pageSize)
      const partes = await Promise.all(
        fatias.map((f) => prisma.tender.findMany({ where: grupos[f.grupo], orderBy, skip: f.skip, take: f.take, select }))
      )
      rows = partes.flat() as Record<string, unknown>[]
    }

    const items = rows.map((t) => {
      const matches = t.tenderMatches as MatchDaLista[] | undefined
      if (!matches) return t

      const bestScore = matches.reduce((max, m) => Math.max(max, m.score), 0)
      const dentroDeObraCompleta = matches.every((m) => m.dentroDeObraCompleta)
      const classificacao = matches.some((m) => m.matchedByCode) ? 'exata' : !dentroDeObraCompleta && bestScore >= 0.7 ? 'alta' : 'media'

      return {
        ...t,
        tenderMatches: undefined,
        match: {
          score: bestScore,
          classificacao,
          itensRelacionados: matches.map((m) => m.monitoredItem.name),
          palavrasChave: Array.from(new Set(matches.flatMap((m) => m.matchedKeywords))),
          dentroDeObraCompleta,
        },
      }
    })

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      ...(totais ? { totais } : {}),
      ...(buscaLimitada ? { buscaLimitada } : {}),
    })
  })
)

tendersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    let tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    })
    if (!tender) {
      res.status(404).json({ error: 'Licitação não encontrada' })
      return
    }

    // Busca sob demanda: a coleta periódica não traz os itens (chamada separada
    // no PNCP) — busca na primeira vez que alguém abre o detalhe e guarda.
    if (tender.items.length === 0 && tender.fonte === 'PNCP') {
      try {
        const buscou = await garantirItensPNCP(tender)
        if (buscou) {
          tender = await prisma.tender.findUnique({ where: { id: req.params.id }, include: { items: true } })
        }
      } catch (err) {
        console.error('[Tenders] Erro ao buscar itens do PNCP:', err)
      }
    }

    if (!tender) {
      res.status(404).json({ error: 'Licitação não encontrada' })
      return
    }
    res.json(semRawJson(tender))
  })
)

const checklistItemSchema = z.object({
  id: z.string().min(1).max(100),
  section: z.string().min(1).max(200),
  label: z.string().min(1).max(500),
  hint: z.string().max(2000).optional(),
  checked: z.boolean(),
  custom: z.boolean(),
})

const putChecklistSchema = z.object({
  items: z.array(checklistItemSchema).min(1).max(300),
})

// Retorna o checklist do usuário para esta licitação, criando a partir do
// template padrão (guia de habilitação Lei 14.133/2021) na primeira vez.
tendersRouter.get(
  '/:id/checklist',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!

    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const existing = await prisma.tenderChecklist.findUnique({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
    })
    if (existing) {
      res.json(existing)
      return
    }

    const created = await prisma.tenderChecklist.create({
      data: {
        companyId,
        userId: req.userId!,
        tenderId: req.params.id,
        items: buildChecklistTemplate() as unknown as object,
      },
    })
    res.json(created)
  })
)

// Salva o estado do checklist (itens marcados + itens customizados adicionados
// pelo usuário) — o frontend envia o array completo a cada alteração.
tendersRouter.put(
  '/:id/checklist',
  asyncHandler(async (req, res) => {
    const { items } = putChecklistSchema.parse(req.body)
    const companyId = req.companyId!

    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const saved = await prisma.tenderChecklist.upsert({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
      update: { items: items as ChecklistItem[] as unknown as object },
      create: {
        companyId,
        userId: req.userId!,
        tenderId: req.params.id,
        items: items as ChecklistItem[] as unknown as object,
      },
    })
    res.json(saved)
  })
)

// Retorna a análise do edital feita por IA, se já existir.
tendersRouter.get(
  '/:id/analysis',
  asyncHandler(async (req, res) => {
    const analysis = await prisma.tenderAnalysis.findUnique({ where: { tenderId: req.params.id } })
    if (!analysis) {
      res.status(404).json({ error: 'Análise ainda não foi solicitada para esta licitação' })
      return
    }
    res.json(analiseParaResposta(analysis, req.isAdmin === true))
  })
)

// Enfileira a análise do edital e responde na hora com o status. O trabalho
// em si (baixar os PDFs do PNCP e chamar o modelo) leva minutos e roda no
// worker — antes era síncrono aqui e o proxy cortava a requisição antes de
// terminar. O cliente acompanha por GET /:id/analysis.
tendersRouter.post(
  '/:id/analyze',
  escritaSensivelLimiter,
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    if (!analiseHabilitada()) {
      throw new ApiError(503, 'A análise de edital por IA está desligada nesta instalação')
    }

    // Reanálise forçada sobrescreve a análise que TODAS as empresas veem e
    // gasta crédito de IA — por isso só admin pode forçar. Usuário comum
    // recebe a análise já existente (ou dispara a primeira, se não houver).
    const force = req.query.force === 'true' && req.isAdmin === true
    const existing = await prisma.tenderAnalysis.findUnique({ where: { tenderId: req.params.id } })

    if (!force) {
      if (existing?.status === 'DONE') {
        res.json(analiseParaResposta(existing, req.isAdmin === true))
        return
      }
      if (existing?.status === 'RUNNING' || existing?.status === 'PENDING') {
        res.status(202).json(analiseParaResposta(existing, req.isAdmin === true))
        return
      }
    }

    if (!force && existing && falhouHaPouco(existing, req.isAdmin === true)) {
      throw new ApiError(429, 'A última análise deste edital não deu certo há pouco. Tente de novo mais tarde.', {
        code: 'ANALISE_FALHOU_HA_POUCO',
      })
    }

    // Só chega aqui quem vai de fato gastar IA (análise pronta ou em andamento
    // já voltou acima, de graça — a análise é compartilhada entre as empresas).
    await exigirCotaDaRequisicao(req, 'analisesIaMes')
    if (!req.isAdmin && (await pedidosDeAnaliseNaUltimaHora(req.companyId!)) >= MAX_ANALISES_POR_HORA) {
      throw new ApiError(429, 'Muitas análises pedidas na última hora. Aguarde um pouco antes de pedir outra.', { code: 'ANALISES_POR_HORA' })
    }

    const reservada = await reservarAnalise(req.params.id, force)
    if (!reservada) {
      const emAndamento = await prisma.tenderAnalysis.findUnique({ where: { tenderId: req.params.id } })
      res.status(202).json(emAndamento ? analiseParaResposta(emAndamento, req.isAdmin === true) : null)
      return
    }

    await registrarAuditoria(req, {
      action: 'ANALISE_SOLICITADA',
      entityType: 'tender',
      entityId: req.params.id,
      metadata: { forcada: force },
    })

    const enfileirou = await enfileirarSemTravar(
      analiseQueue,
      'analisar-edital',
      { tenderId: req.params.id, companyId: req.companyId!, userId: req.userId! },
      'Análise',
      { deduplication: { id: `analise-${req.params.id}` } }
    )
    if (!enfileirou) {
      await desfazerReserva(req.params.id, existing)
      throw new ApiError(503, 'A fila de análise está indisponível no momento — tente de novo em alguns minutos')
    }

    res.status(202).json(analiseParaResposta(reservada, req.isAdmin === true))
  })
)

// Prazos legais da sessão em DIAS ÚTEIS (art. 164 da Lei 14.133: esclarecimento
// e impugnação até 3 dias úteis antes da abertura). Usa a data de abertura da
// licitação e, na falta dela, a data da sessão lida pela IA. Considera só os
// feriados nacionais — o prazo oficial é sempre o do edital.
tendersRouter.get(
  '/:id/prazos',
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      select: { fonte: true, aberturaAt: true, encerramentoAt: true, analysis: { select: { status: true, resultado: true } } },
    })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    let sessao: Date | null = dataDaSessao(tender)
    let origem: 'abertura' | 'analise-ia' = 'abertura'
    if (!sessao && tender.analysis?.status === 'DONE' && tender.analysis.resultado) {
      sessao = lerDataTexto((tender.analysis.resultado as unknown as { dataSessao?: string }).dataSessao)
      origem = 'analise-ia'
    }
    if (!sessao) {
      res.json({ disponivel: false, motivo: 'A licitação não informa a data da sessão.' })
      return
    }

    res.json({
      disponivel: true,
      origem,
      ...calcularPrazosDaSessao(sessao),
      aviso: 'Estimativa com feriados nacionais; confira o prazo oficial no edital.',
    })
  })
)

// ---------------------------------------------------------------
// Matriz de exigências: cada exigência do edital em uma linha, com o texto
// literal, o arquivo, a página e o item de onde veio, o responsável por atendê-la
// e a conferência por código de que o texto existe mesmo no documento. Cada
// empresa marca o que já atendeu (não vaza entre empresas).
// ---------------------------------------------------------------

interface EstadoDaMatriz {
  [chave: string]: { atendida: boolean; nota: string | null; em: string; por: string }
}

async function carregarMatriz(tenderId: string) {
  const analysis = await prisma.tenderAnalysis.findUnique({ where: { tenderId }, select: { status: true, resultado: true, pipeline: true } })
  const resultado = analysis?.status === 'DONE' ? (analysis.resultado as unknown as Partial<EditalAnalysisResult> | null) : null
  const matriz = resultado && Array.isArray(resultado.matrizExigencias) ? resultado.matrizExigencias : null
  return { analysis, matriz }
}

tendersRouter.get(
  '/:id/matriz',
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const { analysis, matriz } = await carregarMatriz(req.params.id)
    if (!matriz) {
      res.json({
        disponivel: false,
        motivo: analysis?.status === 'DONE'
          ? 'Esta análise é anterior à matriz de exigências. Peça uma nova análise ao administrador.'
          : 'A matriz aparece depois que a análise do edital é feita.',
      })
      return
    }

    const progresso = await prisma.requirementProgress.findUnique({
      where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } },
    })
    const estado = (progresso?.state ?? {}) as unknown as EstadoDaMatriz

    const itens = (matriz as ExigenciaVerificada[]).map((e) => {
      const chave = chaveDaExigencia(e.texto)
      return { ...e, chave, atendida: estado[chave]?.atendida === true, nota: estado[chave]?.nota ?? null }
    })

    res.json({
      disponivel: true,
      pipeline: analysis?.pipeline ?? null,
      itens,
      resumo: {
        total: itens.length,
        atendidas: itens.filter((i) => i.atendida).length,
        verificacao: resumoDaVerificacao(itens.filter((i) => i.verificacao)),
      },
    })
  })
)

const marcarExigenciaSchema = z.object({
  atendida: z.boolean(),
  nota: z.string().trim().max(300).nullable().optional(),
})

tendersRouter.put(
  '/:id/matriz/:chave',
  asyncHandler(async (req, res) => {
    const { atendida, nota } = marcarExigenciaSchema.parse(req.body)
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const { matriz } = await carregarMatriz(req.params.id)
    const exigencia = matriz?.find((e) => chaveDaExigencia(e.texto) === req.params.chave)
    if (!exigencia) throw new ApiError(404, 'Exigência não encontrada nesta licitação')

    const companyId = req.companyId!
    const existente = await prisma.requirementProgress.findUnique({ where: { companyId_tenderId: { companyId, tenderId: req.params.id } } })
    const estado = { ...((existente?.state ?? {}) as unknown as EstadoDaMatriz) }
    estado[req.params.chave] = { atendida, nota: nota ?? null, em: new Date().toISOString(), por: req.userId! }

    await prisma.requirementProgress.upsert({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
      update: { state: estado as unknown as object },
      create: { companyId, tenderId: req.params.id, state: estado as unknown as object },
    })

    await registrarAuditoria(req, {
      action: 'EXIGENCIA_ATUALIZADA',
      entityType: 'tender',
      entityId: req.params.id,
      metadata: { exigencia: exigencia.texto.slice(0, 120), atendida },
    })
    res.json({ chave: req.params.chave, atendida, nota: nota ?? null })
  })
)

// Painel do "Fiscal": semáforo da habilitação (o que o edital pede × o cofre da
// empresa, olhando a validade NA DATA DA SESSÃO) e alertas legais fixos sobre
// exigências que parecem passar dos limites da Lei 14.133. Ambos são apoio à
// decisão, não parecer jurídico. Os alertas só existem para análises feitas
// depois que a IA passou a extrair esses campos.
tendersRouter.get(
  '/:id/habilitacao',
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      select: { fonte: true, aberturaAt: true, encerramentoAt: true, valorEstimado: true, analysis: { select: { status: true, resultado: true } } },
    })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const analisada = tender.analysis?.status === 'DONE' && tender.analysis.resultado != null
    const analise = analisada ? (tender.analysis!.resultado as unknown as Partial<EditalAnalysisResult>) : null

    const sessao = dataDaSessao(tender) ?? (analise ? lerDataTexto(analise.dataSessao) : null)

    const docs = await prisma.companyDocument.findMany({
      where: { companyId: req.companyId! },
      select: { id: true, nome: true, tipo: true, dataValidade: true, arquivo: { select: { id: true } } },
    })
    const comArquivo = new Set(docs.filter((d) => d.arquivo).map((d) => d.id))

    const avaliada = avaliarHabilitacao({
      checklist: buildChecklistTemplate(),
      documentos: docs,
      documentosExigidosIA: analise ? (analise.documentosExigidos ?? []) : null,
      sessao,
    })
    const habilitacao = {
      ...avaliada,
      requisitos: avaliada.requisitos.map((r) => (r.documento ? { ...r, documento: { ...r.documento, temArquivo: comArquivo.has(r.documento.id) } } : r)),
    }

    const alertas = alertasDaAnalise(analise, tender.valorEstimado != null ? Number(tender.valorEstimado) : null)

    res.json({
      analise: { status: tender.analysis?.status ?? null, feita: analisada },
      habilitacao,
      alertas: {
        disponivel: alertas.disponivel,
        itens: alertas.itens,
        aviso:
          'Indícios para análise jurídica, não conclusões. O texto extraído pode estar incompleto e a lei admite exceções; valide com advogado antes de impugnar.',
      },
      prazos: sessao ? calcularPrazosDaSessao(sessao) : null,
    })
  })
)

export const PARTICIPATION_STATUS_VALUES = ['AVALIANDO', 'VOU_PARTICIPAR', 'NAO_VOU_PARTICIPAR', 'PARTICIPEI'] as const

interface PlanState {
  doneIds: string[]
  custom: PlanMilestone[]
}

// A decisão de participar (ou não) é o "portão" do fluxo: fica registrada com
// quem decidiu, quando e de qual estado para qual. Só grava se de fato mudou.
async function auditarMudancaDeStatus(req: Request, tenderId: string, de: string | null, para: string) {
  if ((de ?? 'AVALIANDO') === para) return
  await registrarAuditoria(req, {
    action: 'PARTICIPACAO_STATUS',
    entityType: 'tender',
    entityId: tenderId,
    metadata: { de: de ?? 'AVALIANDO', para },
  })
}

async function buildPlanResponse(tenderId: string, status: string, state: PlanState) {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { fonte: true, publicadoAt: true, encerramentoAt: true, aberturaAt: true },
  })
  const analysis = await prisma.tenderAnalysis.findUnique({ where: { tenderId } })
  const analysisPrazos =
    analysis?.status === 'DONE' && analysis.resultado
      ? (analysis.resultado as unknown as { prazoImpugnacao: string; prazoEsclarecimento: string })
      : null

  const auto = buildAutoMilestones(tender ?? { fonte: '', publicadoAt: null, encerramentoAt: null, aberturaAt: null }, analysisPrazos).map(
    (m) => ({ ...m, done: m.done || state.doneIds.includes(m.id) })
  )

  return { status, milestones: [...auto, ...state.custom] }
}

// Retorna o plano de participação, criando um vazio na primeira vez. Os
// marcos automáticos (datas da licitação + prazos da análise por IA) são
// recalculados a cada consulta — ver participationPlanTemplate.ts.
tendersRouter.get(
  '/:id/plano',
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!

    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const existing = await prisma.tenderParticipationPlan.findUnique({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
    })

    const state = (existing?.state as unknown as PlanState) ?? { doneIds: [], custom: [] }
    const status = existing?.status ?? 'AVALIANDO'

    res.json(await buildPlanResponse(req.params.id, status, state))
  })
)

const putPlanoSchema = z.object({
  status: z.enum(PARTICIPATION_STATUS_VALUES),
  milestones: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(500),
        date: z.string().max(40).nullable(),
        detalhe: z.string().max(2000).nullable(),
        done: z.boolean(),
        custom: z.boolean(),
      })
    )
    .max(200),
})

// Salva o status de decisão + quais marcos foram marcados como feitos +
// marcos customizados — o frontend envia a lista completa (automáticos +
// customizados) a cada alteração, igual ao checklist.
tendersRouter.put(
  '/:id/plano',
  asyncHandler(async (req, res) => {
    const { status, milestones } = putPlanoSchema.parse(req.body)
    const companyId = req.companyId!

    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const state: PlanState = {
      doneIds: milestones.filter((m) => !m.custom && m.done).map((m) => m.id),
      custom: milestones.filter((m) => m.custom),
    }

    const antes = await prisma.tenderParticipationPlan.findUnique({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
      select: { status: true },
    })

    await prisma.tenderParticipationPlan.upsert({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
      update: { status, state: state as unknown as object },
      create: {
        companyId,
        userId: req.userId!,
        tenderId: req.params.id,
        status,
        state: state as unknown as object,
      },
    })

    await auditarMudancaDeStatus(req, req.params.id, antes?.status ?? null, status)
    res.json(await buildPlanResponse(req.params.id, status, state))
  })
)

const putPlanoStatusSchema = z.object({ status: z.enum(PARTICIPATION_STATUS_VALUES) })

// Troca só o status de decisão (ex: "marcar como interessado" a partir da
// lista de matches), sem precisar reenviar a lista inteira de marcos —
// diferente do PUT completo acima, não corre o risco de apagar progresso
// já salvo (itens marcados, marcos customizados) por causa de um corpo
// enviado sem eles.
tendersRouter.patch(
  '/:id/plano/status',
  asyncHandler(async (req, res) => {
    const { status } = putPlanoStatusSchema.parse(req.body)
    const companyId = req.companyId!

    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada')

    const existing = await prisma.tenderParticipationPlan.findUnique({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
    })
    const state = (existing?.state as unknown as PlanState) ?? { doneIds: [], custom: [] }

    await prisma.tenderParticipationPlan.upsert({
      where: { companyId_tenderId: { companyId, tenderId: req.params.id } },
      update: { status },
      create: {
        companyId,
        userId: req.userId!,
        tenderId: req.params.id,
        status,
        state: state as unknown as object,
      },
    })

    await auditarMudancaDeStatus(req, req.params.id, existing?.status ?? null, status)
    res.json(await buildPlanResponse(req.params.id, status, state))
  })
)
