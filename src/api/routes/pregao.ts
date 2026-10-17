import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { calcularEstudo } from '../../lib/estudoDeCustos'
import { avaliarLance, avaliarMeuLance, limitesDoAlvo, type Avaliacao, type LimitesDoAlvo } from '../../lib/bela/copiloto'
import { carregar, dadosSalvos } from './estudos'

export const pregaoRouter = Router({ mergeParams: true })

const MAX_LANCES_REGISTRADOS = 2000
const ALVO_GLOBAL = 'global'

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

interface AlvoDoPregao {
  id: string
  rotulo: string
  numero: number | null
  quantidade: number
  precoProposto: number | null
  limites: LimitesDoAlvo
}

async function acompanhamentoDe(companyId: string, tenderId: string) {
  return prisma.pregaoAcompanhamento.upsert({
    where: { companyId_tenderId: { companyId, tenderId } },
    update: {},
    create: { companyId, tenderId },
  })
}

async function montarPainel(companyId: string, tenderId: string) {
  const ctx = await carregar(companyId, tenderId)
  const { dados } = await dadosSalvos(companyId, tenderId, ctx)
  const resultado = calcularEstudo(ctx.itens, dados, { distanciaLinhaRetaKm: ctx.distanciaLinhaRetaKm, valorEstimadoTotal: num(ctx.tender.valorEstimado) })
  const acompanhamento = await acompanhamentoDe(companyId, tenderId)
  const lances = await prisma.pregaoLance.findMany({
    where: { acompanhamentoId: acompanhamento.id },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const base = resultado.custoItens + resultado.custoDeslocamento + resultado.custoOutros
  const rateio = resultado.custoItens > 0 ? 1 + (resultado.custoDeslocamento + resultado.custoOutros) / resultado.custoItens : 1
  const comum = { impostosPct: dados.impostosPct, margemDesejadaPct: dados.margemDesejadaPct }
  const porTotal = acompanhamento.criterio === 'TOTAL_DO_ITEM'

  const alvos: AlvoDoPregao[] = [
    { id: ALVO_GLOBAL, rotulo: 'Valor global', numero: null, quantidade: 1, precoProposto: resultado.receita > 0 ? resultado.receita : null, limites: { custoComRateio: base, ...comum } },
    ...ctx.itens.map((it) => {
      const custoUnit = dados.itens[it.id]?.custoUnit ?? 0
      const venda = dados.itens[it.id]?.precoVendaUnit ?? null
      const fator = porTotal ? it.quantidade : 1
      return {
        id: it.id,
        rotulo: `Item ${it.numero ?? '?'}: ${it.descricao.slice(0, 90)}`,
        numero: it.numero,
        quantidade: it.quantidade,
        precoProposto: venda === null ? null : Math.round(venda * fator * 100) / 100,
        limites: { custoComRateio: Math.round(custoUnit * rateio * fator * 100) / 100, ...comum },
      }
    }),
  ]

  const regras = { decrementoPct: Number(acompanhamento.decrementoPct), maxLances: acompanhamento.maxLances }
  const painelDosAlvos = alvos.map((a) => {
    const doAlvo = lances.filter((l) => l.alvo === a.id)
    const maisRecente = doAlvo[0]
    const meusValores = doAlvo.filter((l) => l.origem === 'MEU_LANCE').map((l) => Number(l.valor))
    const meus = meusValores.length
    const meuMenor = meus > 0 ? Math.min(...meusValores) : null
    const avaliacao: Avaliacao | null = !maisRecente
      ? null
      : maisRecente.origem === 'MEU_LANCE'
        ? avaliarMeuLance(Number(maisRecente.valor), a.limites, regras, meus)
        : avaliarLance(Number(maisRecente.valor), a.limites, regras, meus, meuMenor)
    return {
      id: a.id,
      rotulo: a.rotulo,
      numero: a.numero,
      quantidade: a.quantidade,
      precoProposto: a.precoProposto,
      custo: a.limites.custoComRateio,
      ...limitesDoAlvo(a.limites),
      meusLances: meus,
      avaliacao,
    }
  })

  return {
    tender: { id: ctx.tender.id, orgao: ctx.tender.orgao, numeroControle: ctx.tender.numeroControle, objeto: ctx.tender.objetoResumido ?? ctx.tender.objeto.slice(0, 300) },
    semCustos: base <= 0,
    impostosPct: dados.impostosPct,
    margemDesejadaPct: dados.margemDesejadaPct,
    config: {
      decrementoPct: regras.decrementoPct,
      maxLances: regras.maxLances,
      criterio: acompanhamento.criterio,
      resultado: acompanhamento.resultado,
      valorFinal: num(acompanhamento.valorFinal),
      encerradoEm: acompanhamento.encerradoEm,
    },
    alvos: painelDosAlvos,
    lances: lances.map((l) => ({ id: l.id, alvo: l.alvo, origem: l.origem, valor: Number(l.valor), margemPct: num(l.margemPct), createdAt: l.createdAt })),
    alvosConhecidos: alvos,
  }
}

const publico = (p: Awaited<ReturnType<typeof montarPainel>>) => {
  const { alvosConhecidos: _ignorado, ...resto } = p
  return resto
}

pregaoRouter.get(
  '/',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    res.json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)

const lanceSchema = z.object({
  alvo: z.string().min(1).max(64),
  origem: z.enum(['MELHOR_LANCE', 'MEU_LANCE']),
  valor: z.number().positive().max(1e13),
})

pregaoRouter.post(
  '/lances',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const pedido = lanceSchema.parse(req.body)
    const painel = await montarPainel(req.companyId!, req.params.id)
    const alvo = painel.alvosConhecidos.find((a) => a.id === pedido.alvo)
    if (!alvo) throw new ApiError(400, 'Item do pregão não encontrado')
    if (painel.config.encerradoEm) throw new ApiError(409, 'Este pregão já foi encerrado. Reabra para registrar lances.')

    const acompanhamento = await acompanhamentoDe(req.companyId!, req.params.id)
    const total = await prisma.pregaoLance.count({ where: { acompanhamentoId: acompanhamento.id } })
    if (total >= MAX_LANCES_REGISTRADOS) throw new ApiError(409, 'Limite de lances registrados neste pregão atingido.')

    const valor = Math.round(pedido.valor * 100) / 100
    const meus = painel.alvos.find((a) => a.id === alvo.id)?.meusLances ?? 0
    const avaliacao = avaliarLance(valor, alvo.limites, { decrementoPct: painel.config.decrementoPct, maxLances: painel.config.maxLances }, meus)
    await prisma.pregaoLance.create({
      data: { acompanhamentoId: acompanhamento.id, alvo: alvo.id, origem: pedido.origem, valor, margemPct: alvo.limites.custoComRateio > 0 ? avaliacao.margemPct : null, userId: req.userId ?? null },
    })
    res.status(201).json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)

pregaoRouter.delete(
  '/lances/:lanceId',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const acompanhamento = await prisma.pregaoAcompanhamento.findUnique({ where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } }, select: { id: true } })
    const apagados = acompanhamento ? await prisma.pregaoLance.deleteMany({ where: { id: req.params.lanceId, acompanhamentoId: acompanhamento.id } }) : { count: 0 }
    if (apagados.count === 0) throw new ApiError(404, 'Lance não encontrado')
    res.json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)

const configSchema = z.object({
  decrementoPct: z.number().min(0.01).max(20).optional(),
  maxLances: z.number().int().min(1).max(10).optional(),
  criterio: z.enum(['UNITARIO', 'TOTAL_DO_ITEM']).optional(),
})

pregaoRouter.put(
  '/config',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const config = configSchema.parse(req.body)
    await carregar(req.companyId!, req.params.id)
    await acompanhamentoDe(req.companyId!, req.params.id)
    await prisma.pregaoAcompanhamento.update({ where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } }, data: config })
    res.json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)

const resultadoSchema = z.object({
  resultado: z.enum(['GANHOU', 'PERDEU', 'DESCLASSIFICADO', 'FRACASSADO']).nullable(),
  valorFinal: z.number().positive().max(1e13).nullable().optional(),
})

pregaoRouter.put(
  '/resultado',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { resultado, valorFinal } = resultadoSchema.parse(req.body)
    await carregar(req.companyId!, req.params.id)
    await acompanhamentoDe(req.companyId!, req.params.id)
    await prisma.pregaoAcompanhamento.update({
      where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } },
      data: { resultado, valorFinal: resultado ? (valorFinal ?? null) : null, encerradoEm: resultado ? new Date() : null },
    })
    res.json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)
