// ============================================================
// api/routes/estudos.ts — Estudo de custos da licitação ESCOLHIDA (status "Vou participar"):
// pesquisa de preços de mercado, custos, deslocamento, prazo, lucro/prejuízo, preço mínimo e PDF.
// Cálculo em lib/estudoDeCustos.ts; o resultado nunca é gravado, só o que o usuário digitou.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma, garantirItensPNCP } from '../../services/tenderService'
import { registrarAuditoria } from '../../services/auditService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoPrecosLimiter } from '../rateLimit'
import {
  DadosDoEstudo,
  ItemDaLicitacao,
  calcularEstudo,
  dadosIniciais,
  lerPrazoEmDias,
} from '../../lib/estudoDeCustos'
import { findMunicipioByNomeUf, haversineKm } from '../../lib/geoService'
import { PrecosIndisponiveisError, pesquisarPrecos } from '../../services/pesquisaDePrecosService'
import { gerarPdfDoEstudo } from '../../services/estudoPdf'

export const estudosRouter = Router()

const dinheiro = z.number().finite().min(0).max(1e12)
const pctSchema = z.number().finite().min(0).max(100)

const dadosSchema = z.object({
  versao: z.literal(1),
  itens: z.record(z.string().max(80), z.object({ custoUnit: dinheiro.nullable(), precoVendaUnit: dinheiro.nullable() })).refine((o) => Object.keys(o).length <= 500),
  mercado: z
    .record(
      z.string().max(80),
      z.object({
        mediana: dinheiro,
        minimo: dinheiro,
        maximo: dinheiro,
        amostras: z.number().int().min(0).max(1e6),
        uf: z.string().length(2).nullable(),
        meses: z.number().int().min(1).max(120),
        consultadoEm: z.string().max(40),
      })
    )
    .refine((o) => Object.keys(o).length <= 500),
  deslocamento: z.object({
    kmIdaInformado: z.number().finite().min(0).max(20_000).nullable(),
    viagens: z.number().int().min(0).max(1000),
    valorPorKm: dinheiro,
    pedagioPorViagem: dinheiro,
    hospedagemPorViagem: dinheiro,
  }),
  impostosPct: pctSchema,
  margemDesejadaPct: pctSchema,
  outrosCustos: z.array(z.object({ descricao: z.string().trim().max(200), valor: dinheiro })).max(40),
  prazo: z.object({
    exigidoDias: z.number().int().min(0).max(3650).nullable(),
    exigidoEmDiasUteis: z.boolean(),
    preparoDias: z.number().int().min(0).max(3650),
    assinatura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
})

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Carrega tudo o que o estudo precisa e garante que a licitação foi ESCOLHIDA pela empresa.
async function carregar(companyId: string, tenderId: string) {
  let tender = await prisma.tender.findUnique({ where: { id: tenderId }, include: { items: { orderBy: { numeroItem: 'asc' } }, analysis: true } })
  if (!tender) throw new ApiError(404, 'Licitação não encontrada')

  const plano = await prisma.tenderParticipationPlan.findUnique({ where: { companyId_tenderId: { companyId, tenderId } }, select: { status: true } })
  if (plano?.status !== 'VOU_PARTICIPAR') {
    throw new ApiError(409, 'O estudo de custos fica disponível para licitações marcadas como "Vou participar".')
  }

  if (tender.items.length === 0 && tender.fonte === 'PNCP') {
    try {
      if (await garantirItensPNCP(tender)) {
        tender = await prisma.tender.findUnique({ where: { id: tenderId }, include: { items: { orderBy: { numeroItem: 'asc' } }, analysis: true } })
      }
    } catch (err) {
      console.error('[Estudo] Erro ao buscar itens do PNCP:', err)
    }
  }
  if (!tender) throw new ApiError(404, 'Licitação não encontrada')

  const empresa = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, cnpj: true, cpf: true, baseMunicipio: true, baseUf: true, baseLat: true, baseLng: true },
  })

  const itens: (ItemDaLicitacao & { codigoCatalogo: string | null; tipoCatalogo: 'MATERIAL' | 'SERVICO' | null })[] =
    tender.items.length > 0
      ? tender.items.map((it) => ({
          id: it.id,
          numero: it.numeroItem,
          descricao: it.descricao,
          unidade: it.unidadeMedida,
          quantidade: num(it.quantidade) && num(it.quantidade)! > 0 ? num(it.quantidade)! : 1,
          valorEstimadoUnit: num(it.valorUnitario),
          codigoCatalogo: it.catmatCode ?? it.catserCode,
          tipoCatalogo: it.catmatCode ? 'MATERIAL' : it.catserCode ? 'SERVICO' : null,
        }))
      : [
          // Sem itens detalhados (comum fora do PNCP): um item único com o objeto inteiro.
          {
            id: 'objeto',
            numero: 1,
            descricao: tender.objetoResumido ?? tender.objeto.slice(0, 300),
            unidade: null,
            quantidade: 1,
            valorEstimadoUnit: num(tender.valorEstimado),
            codigoCatalogo: null,
            tipoCatalogo: null,
          },
        ]

  // Distância: base da empresa até o município da licitação (coordenadas do IBGE).
  let destino: { lat: number; lng: number } | null = null
  if (tender.municipioLat !== null && tender.municipioLng !== null) destino = { lat: tender.municipioLat, lng: tender.municipioLng }
  else if (tender.municipio && tender.uf) {
    const m = findMunicipioByNomeUf(tender.municipio, tender.uf)
    if (m) destino = { lat: m.lat, lng: m.lng }
  }
  const distanciaLinhaRetaKm =
    destino && empresa.baseLat !== null && empresa.baseLng !== null
      ? Math.round(haversineKm(empresa.baseLat, empresa.baseLng, destino.lat, destino.lng))
      : null

  const resultadoIa = (tender.analysis?.resultado ?? null) as { prazoEntrega?: string; local?: string } | null
  return { tender, empresa, itens, distanciaLinhaRetaKm, prazoDoEdital: resultadoIa?.prazoEntrega ?? null, localDoEdital: resultadoIa?.local ?? null }
}

type Contexto = Awaited<ReturnType<typeof carregar>>

async function dadosSalvos(companyId: string, tenderId: string, ctx: Contexto): Promise<{ dados: DadosDoEstudo; salvoEm: Date | null }> {
  const salvo = await prisma.costStudy.findUnique({ where: { companyId_tenderId: { companyId, tenderId } } })
  if (salvo) {
    const lido = dadosSchema.safeParse(salvo.dados)
    if (lido.success) return { dados: lido.data, salvoEm: salvo.updatedAt }
  }
  // Primeira abertura: pré-preenche o prazo com o que a análise do edital leu.
  const dados = dadosIniciais()
  const prazo = lerPrazoEmDias(ctx.prazoDoEdital)
  if (prazo) {
    dados.prazo.exigidoDias = prazo.dias
    dados.prazo.exigidoEmDiasUteis = prazo.uteis
  }
  return { dados, salvoEm: null }
}

function montarResposta(ctx: Contexto, dados: DadosDoEstudo, salvoEm: Date | null) {
  const { tender, empresa, itens } = ctx
  return {
    tender: {
      id: tender.id,
      objeto: tender.objetoResumido ?? tender.objeto,
      orgao: tender.orgao,
      municipio: tender.municipio,
      uf: tender.uf,
      valorEstimado: num(tender.valorEstimado),
      encerramentoAt: tender.encerramentoAt,
      aberturaAt: tender.aberturaAt,
      modalidade: tender.modalidade,
      linkEdital: tender.linkEdital,
    },
    itens: itens.map((i) => ({ ...i, medianaDeMercado: undefined })),
    dados,
    base: { municipio: empresa.baseMunicipio, uf: empresa.baseUf, definida: empresa.baseLat !== null },
    distanciaLinhaRetaKm: ctx.distanciaLinhaRetaKm,
    prazoDoEdital: ctx.prazoDoEdital,
    resultado: calcularEstudo(itens, dados, { distanciaLinhaRetaKm: ctx.distanciaLinhaRetaKm, valorEstimadoTotal: num(tender.valorEstimado) }),
    salvoEm,
  }
}

estudosRouter.get(
  '/:tenderId',
  asyncHandler(async (req, res) => {
    const ctx = await carregar(req.companyId!, req.params.tenderId)
    const { dados, salvoEm } = await dadosSalvos(req.companyId!, req.params.tenderId, ctx)
    res.json(montarResposta(ctx, dados, salvoEm))
  })
)

// Recalcula sem gravar (a tela chama enquanto o usuário digita).
estudosRouter.post(
  '/:tenderId/calcular',
  asyncHandler(async (req, res) => {
    const { dados } = z.object({ dados: dadosSchema }).parse(req.body)
    const ctx = await carregar(req.companyId!, req.params.tenderId)
    res.json({ resultado: montarResposta(ctx, dados, null).resultado })
  })
)

estudosRouter.put(
  '/:tenderId',
  asyncHandler(async (req, res) => {
    const { dados } = z.object({ dados: dadosSchema }).parse(req.body)
    const ctx = await carregar(req.companyId!, req.params.tenderId)
    const salvo = await prisma.costStudy.upsert({
      where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.tenderId } },
      create: { companyId: req.companyId!, userId: req.userId!, tenderId: req.params.tenderId, dados },
      update: { dados },
    })
    await registrarAuditoria(req, { action: 'ESTUDO_SALVO', entityType: 'licitacao', entityId: req.params.tenderId })
    res.json(montarResposta(ctx, dados, salvo.updatedAt))
  })
)

const precosSchema = z.object({
  itemId: z.string().min(1).max(80),
  uf: z.string().length(2).nullable().optional(),
  meses: z.number().int().min(1).max(60).default(12),
})

// Pesquisa de preços de mercado de UM item (por CATMAT/CATSER). Não grava: a tela guarda o
// resultado nos dados do estudo, com a data da consulta.
estudosRouter.post(
  '/:tenderId/precos',
  estudoPrecosLimiter,
  asyncHandler(async (req, res) => {
    const { itemId, uf, meses } = precosSchema.parse(req.body)
    const ctx = await carregar(req.companyId!, req.params.tenderId)
    const item = ctx.itens.find((i) => i.id === itemId)
    if (!item) throw new ApiError(404, 'Item não encontrado nesta licitação')
    if (!item.codigoCatalogo || !item.tipoCatalogo) {
      throw new ApiError(422, 'Este item não tem código CATMAT/CATSER, então não há pesquisa automática. Informe o preço à mão.')
    }
    try {
      const pesquisa = await pesquisarPrecos({ tipo: item.tipoCatalogo, codigo: item.codigoCatalogo, uf: uf ?? null, meses })
      res.json({ itemId, ...pesquisa, consultadoEm: new Date().toISOString() })
    } catch (err) {
      if (err instanceof PrecosIndisponiveisError) throw new ApiError(502, err.message)
      throw err
    }
  })
)

estudosRouter.get(
  '/:tenderId/pdf',
  asyncHandler(async (req, res) => {
    const ctx = await carregar(req.companyId!, req.params.tenderId)
    const { dados } = await dadosSalvos(req.companyId!, req.params.tenderId, ctx)
    const r = montarResposta(ctx, dados, null)
    const usuario = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true, email: true } })

    const pdf = await gerarPdfDoEstudo({
      empresa: {
        nome: ctx.empresa.name,
        documento: ctx.empresa.cnpj ?? ctx.empresa.cpf,
        base: ctx.empresa.baseMunicipio && ctx.empresa.baseUf ? `${ctx.empresa.baseMunicipio}/${ctx.empresa.baseUf}` : null,
      },
      licitacao: {
        objeto: ctx.tender.objeto,
        orgao: ctx.tender.orgao,
        local: [ctx.tender.municipio, ctx.tender.uf].filter(Boolean).join('/') || ctx.localDoEdital,
        modalidade: ctx.tender.modalidade,
        fonte: ctx.tender.fonte,
        numeroControle: ctx.tender.numeroControle,
        valorEstimado: num(ctx.tender.valorEstimado),
        sessaoEm: ctx.tender.encerramentoAt ?? ctx.tender.aberturaAt,
        linkEdital: ctx.tender.linkEdital,
      },
      itens: ctx.itens,
      dados,
      resultado: r.resultado,
      geradoEm: new Date(),
      geradoPor: usuario?.name ?? usuario?.email ?? 'usuário',
    })
    await registrarAuditoria(req, { action: 'ESTUDO_PDF_GERADO', entityType: 'licitacao', entityId: req.params.tenderId })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="estudo-de-viabilidade-${req.params.tenderId.slice(0, 8)}.pdf"`)
    res.send(pdf)
  })
)
