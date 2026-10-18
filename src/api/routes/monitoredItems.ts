// ============================================================
// api/routes/monitoredItems.ts — CRUD de itens monitorados + rematch
// ============================================================

import { Router, type Request } from 'express'
import { Prisma, type MonitoredItem } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { findMunicipioByNomeUf } from '../../lib/geoService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { exigirCotaDaRequisicao } from '../cotas'
import { rematchLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { exigirCota } from '../../services/quotaService'
import { situacaoDaBusca, solicitarBuscaDoItem, type RespostaDaBusca } from '../../services/rematchService'
import { avisoDoLimite } from '../../lib/limiteDeMatches'
import { interesseDaOrigem, nomeDoItemDoInteresse } from '../../lib/origemDoCadastro'
import { temPalavraSignificativa } from '../../lib/matching'

export const monitoredItemsRouter = Router()

// Precisa bater exatamente com o enum ModalidadeEnum do schema.prisma —
// é contra esses valores que o matcher compara tenders.modalidade.
export const MODALIDADE_VALUES = [
  'PREGAO_ELETRONICO',
  'PREGAO_PRESENCIAL',
  'CONCORRENCIA',
  'DISPENSA_COM_DISPUTA',
  'DISPENSA_SEM_DISPUTA',
  'INEXIGIBILIDADE',
  'CONVITE',
  'TOMADA_DE_PRECOS',
  'CONCURSO',
  'CREDENCIAMENTO',
  'DIALOGO_COMPETITIVO',
  'OUTROS',
] as const

// Tetos de tamanho: sem eles um único item podia chegar com dezenas de
// milhares de palavras-chave (cada uma vira uma regex avaliada no rematch de
// 90 dias) ou strings enormes — custo de CPU/memória desproporcional. Os
// limites são bem acima de qualquer uso real.
const MAX_ITENS_LISTA = 200
const MAX_TAM_TERMO = 120
const MIN_TAM_PALAVRA_CHAVE = 2
const MAX_PALAVRAS_DE_EXCLUSAO = 50
const MAX_TAM_PALAVRA_DE_EXCLUSAO = 60

const createSchema = z.object({
  name: z.string().min(1).max(200),
  keywords: z
    .array(
      z
        .string()
        .trim()
        .min(MIN_TAM_PALAVRA_CHAVE, `Cada palavra-chave precisa ter ao menos ${MIN_TAM_PALAVRA_CHAVE} caracteres`)
        .max(MAX_TAM_TERMO)
        .refine(temPalavraSignificativa, 'Palavra-chave só com "de", "para", "com" e afins casa com quase todas as licitações. Use um termo do que você vende.')
    )
    .max(MAX_ITENS_LISTA)
    .default([]),
  palavrasDeExclusao: z
    .array(z.string().trim().min(MIN_TAM_PALAVRA_CHAVE).max(MAX_TAM_PALAVRA_DE_EXCLUSAO))
    .max(MAX_PALAVRAS_DE_EXCLUSAO)
    .default([]),
  catmatCodes: z.array(z.string().max(MAX_TAM_TERMO)).max(MAX_ITENS_LISTA).default([]),
  catserCodes: z.array(z.string().max(MAX_TAM_TERMO)).max(MAX_ITENS_LISTA).default([]),
  ufs: z.array(z.string().length(2)).max(27).default([]),
  valorMin: z.number().nonnegative().nullable().optional(),
  valorMax: z.number().nonnegative().nullable().optional(),
  modalidades: z.array(z.enum(MODALIDADE_VALUES)).max(MODALIDADE_VALUES.length).default([]),
  // Filtro por órgão — nome específico ou trecho (categoria, ex: "PREFEITURA")
  orgaos: z.array(z.string().min(1).max(MAX_TAM_TERMO)).max(MAX_ITENS_LISTA).default([]),
  // Filtro por código UASG — só bate com licitações do ComprasNet (ver
  // uasgMatches em matcherService.ts). Selecionado via busca em /api/uasg/search.
  uasgCodes: z.array(z.string().min(1).max(MAX_TAM_TERMO)).max(MAX_ITENS_LISTA).default([]),
  // Filtro por raio de distância — alternativa ao filtro por UF
  raioKm: z.number().int().positive().nullable().optional(),
  origemMunicipio: z.string().min(1).max(200).nullable().optional(),
  origemUf: z.string().length(2).nullable().optional(),
})

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() })

const CAMPOS_QUE_MUDAM_O_MATCH = ['keywords', 'palavrasDeExclusao', 'catmatCodes', 'catserCodes', 'ufs', 'valorMin', 'valorMax', 'modalidades', 'orgaos', 'uasgCodes', 'raioKm', 'origemMunicipio', 'origemUf'] as const

type CampoDoRecorte = (typeof CAMPOS_QUE_MUDAM_O_MATCH)[number]

function valorComparavel(valor: unknown): unknown {
  if (valor === undefined || valor === null) return null
  if (valor instanceof Prisma.Decimal) return valor.toNumber()
  return valor
}

function mudouOValor(antes: unknown, depois: unknown): boolean {
  return JSON.stringify(valorComparavel(antes)) !== JSON.stringify(valorComparavel(depois))
}

export function camposDoRecorteQueMudaram(antes: Pick<MonitoredItem, CampoDoRecorte>, pedido: Partial<Record<CampoDoRecorte, unknown>>): CampoDoRecorte[] {
  return CAMPOS_QUE_MUDAM_O_MATCH.filter((campo) => pedido[campo] !== undefined && mudouOValor(antes[campo], pedido[campo]))
}

// Resolve nome+UF de cidade em lat/lng usando a base do IBGE
function geocodeOrigem(municipio: string, uf: string): { lat: number; lng: number } {
  const geo = findMunicipioByNomeUf(municipio, uf)
  if (!geo) {
    throw new ApiError(400, `Cidade de referência "${municipio}/${uf.toUpperCase()}" não encontrada — confira o nome e a UF`)
  }
  return { lat: geo.lat, lng: geo.lng }
}

function itemPublico({ buscaEstado, buscaEncontrados, buscaRemovidos, buscaLimitada, buscaConcluidaEm, ...resto }: MonitoredItem) {
  return { ...resto, situacaoDaBusca: situacaoDaBusca({ buscaEstado, buscaEncontrados, buscaRemovidos, buscaLimitada, buscaConcluidaEm }) }
}

function resumoDaBusca(resposta: RespostaDaBusca) {
  if (resposta.busca === 'em-andamento') return { busca: resposta.busca }
  return { busca: resposta.busca, limitado: resposta.limitado, aviso: resposta.limitado ? avisoDoLimite() : null }
}

async function itemDepoisDaBusca(item: MonitoredItem, resposta: RespostaDaBusca): Promise<MonitoredItem> {
  if (resposta.busca === 'em-andamento') return { ...item, buscaEstado: 'EM_ANDAMENTO' }
  return (await prisma.monitoredItem.findUnique({ where: { id: item.id } })) ?? item
}

async function assertOwnership(itemId: string, companyId: string) {
  const item = await prisma.monitoredItem.findUnique({ where: { id: itemId } })
  if (!item) throw new ApiError(404, 'Item monitorado não encontrado')
  if (item.companyId !== companyId) throw new ApiError(403, 'Este item não pertence a você')
  return item
}

export async function criarItemDoCadastro(req: Request, userId: string, companyId: string): Promise<{ id: string; name: string; busca: RespostaDaBusca['busca'] } | null> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: { origemDoCadastro: true, _count: { select: { monitoredItems: true } } },
  })
  const interesse = interesseDaOrigem(empresa?.origemDoCadastro)
  if (!empresa || !interesse || empresa._count.monitoredItems > 0) return null

  const body = createSchema.parse({ name: nomeDoItemDoInteresse(interesse), keywords: [interesse.termo], ufs: interesse.uf ? [interesse.uf] : [] })
  await exigirCota(companyId, 'itensMonitorados')

  const item = await prisma.monitoredItem.create({
    data: { ...body, companyId, userId, origemLat: null, origemLng: null },
  })
  await registrarAuditoria(
    req,
    {
      action: 'ITEM_MONITORADO_CRIADO',
      entityType: 'item-monitorado',
      entityId: item.id,
      companyId,
      metadata: { nome: item.name, origem: 'cadastro' },
    },
    { userId }
  )
  const { busca } = await solicitarBuscaDoItem(item, 'criacao')
  return { id: item.id, name: item.name, busca }
}

monitoredItemsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body)

    if (body.keywords.length === 0 && body.catmatCodes.length === 0 && body.catserCodes.length === 0) {
      throw new ApiError(400, 'Informe ao menos uma palavra-chave ou código CATMAT/CATSER')
    }

    let origemLat: number | null = null
    let origemLng: number | null = null
    if (body.raioKm) {
      if (!body.origemMunicipio || !body.origemUf) {
        throw new ApiError(400, 'Informe a cidade e a UF de referência para usar o filtro de raio de distância')
      }
      const geo = geocodeOrigem(body.origemMunicipio, body.origemUf)
      origemLat = geo.lat
      origemLng = geo.lng
    }

    await exigirCotaDaRequisicao(req, 'itensMonitorados')

    const item = await prisma.monitoredItem.create({
      data: { ...body, companyId: req.companyId!, userId: req.userId!, origemLat, origemLng },
    })
    await registrarAuditoria(req, {
      action: 'ITEM_MONITORADO_CRIADO',
      entityType: 'item-monitorado',
      entityId: item.id,
      metadata: { nome: item.name },
    })
    const resposta = await solicitarBuscaDoItem(item, 'criacao')
    res.status(201).json({
      ...itemPublico(await itemDepoisDaBusca(item, resposta)),
      ...resumoDaBusca(resposta),
      ...(resposta.busca === 'concluida' ? { matchesEncontrados: resposta.matchesFound } : {}),
    })
  })
)

monitoredItemsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.monitoredItem.findMany({
      where: { companyId: req.companyId! },
      orderBy: { createdAt: 'desc' },
    })
    res.json(items.map(itemPublico))
  })
)

monitoredItemsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await assertOwnership(req.params.id, req.companyId!)
    res.json(itemPublico(item))
  })
)

monitoredItemsRouter.get(
  '/:id/busca',
  asyncHandler(async (req, res) => {
    const item = await assertOwnership(req.params.id, req.companyId!)
    res.json(situacaoDaBusca(item))
  })
)

monitoredItemsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await assertOwnership(req.params.id, req.companyId!)

    const data = updateSchema.parse(req.body)

    // Campos ausentes no PATCH mantêm o valor atual; campos presentes (mesmo
    // que null) substituem — por isso o merge explícito com "!== undefined".
    const effectiveRaioKm = data.raioKm !== undefined ? data.raioKm : existing.raioKm
    const effectiveMunicipio = data.origemMunicipio !== undefined ? data.origemMunicipio : existing.origemMunicipio
    const effectiveUf = data.origemUf !== undefined ? data.origemUf : existing.origemUf

    let origemLat: number | null = null
    let origemLng: number | null = null
    if (effectiveRaioKm) {
      if (!effectiveMunicipio || !effectiveUf) {
        throw new ApiError(400, 'Informe a cidade e a UF de referência para usar o filtro de raio de distância')
      }
      const geo = geocodeOrigem(effectiveMunicipio, effectiveUf)
      origemLat = geo.lat
      origemLng = geo.lng
    }

    const updated = await prisma.monitoredItem.update({
      where: { id: req.params.id },
      data: { ...data, origemLat, origemLng },
    })
    await registrarAuditoria(req, {
      action: 'ITEM_MONITORADO_ALTERADO',
      entityType: 'item-monitorado',
      entityId: updated.id,
      metadata: { nome: updated.name, campos: Object.keys(data) },
    })
    const mudouORecorte = camposDoRecorteQueMudaram(existing, data).length > 0
    const foiAtivado = data.active === true && !existing.active
    if (!mudouORecorte && !foiAtivado) {
      res.json(itemPublico(updated))
      return
    }
    const resposta = await solicitarBuscaDoItem(updated, mudouORecorte ? 'edicao' : 'ativacao')
    res.json({
      ...itemPublico(await itemDepoisDaBusca(updated, resposta)),
      ...resumoDaBusca(resposta),
      ...(resposta.busca === 'concluida' ? { matchesRemovidos: resposta.removidos, matchesEncontrados: resposta.matchesFound } : {}),
    })
  })
)

monitoredItemsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await assertOwnership(req.params.id, req.companyId!)

    await prisma.monitoredItem.delete({ where: { id: req.params.id } })
    await registrarAuditoria(req, {
      action: 'ITEM_MONITORADO_REMOVIDO',
      entityType: 'item-monitorado',
      entityId: item.id,
      metadata: { nome: item.name },
    })
    res.status(204).send()
  })
)

// Varre licitações já coletadas (não espera o próximo ciclo do worker) em busca
// de matches para este item — útil logo após o cadastro.
monitoredItemsRouter.post(
  '/:id/rematch',
  rematchLimiter,
  asyncHandler(async (req, res) => {
    const item = await assertOwnership(req.params.id, req.companyId!)
    const resposta = await solicitarBuscaDoItem(item, 'buscar-agora')
    res.json({ ...resumoDaBusca(resposta), ...(resposta.busca === 'concluida' ? { matchesFound: resposta.matchesFound } : {}) })
  })
)
