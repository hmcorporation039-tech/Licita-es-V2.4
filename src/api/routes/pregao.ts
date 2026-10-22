import type { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { calcularEstudo } from '../../lib/estudoDeCustos'
import { avaliarLance, avaliarMeuLance, limitesDoAlvo, type Avaliacao } from '../../lib/bela/copiloto'
import { planejarRobo } from '../../lib/bela/roboDeDisputa'
import { alvosDoPregao } from '../../lib/alvosDoPregao'
import { regrasDoEdital } from '../../lib/bela/regrasDoEdital'
import { checklistDaDisputa, desatualizado, escolhaDe, lerPlanoSalvo, passoDosLances, regrasEfetivas, valorFinalMinimo } from '../../lib/bela/planoDeDisputa'
import { registrarAuditoria } from '../../services/auditService'
import { carregar, dadosSalvos } from './estudos'

export const pregaoRouter = Router({ mergeParams: true })

const MAX_LANCES_REGISTRADOS = 2000

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

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
  const alvos = alvosDoPregao(ctx.itens, dados, resultado, acompanhamento.criterio)

  const doEdital = regrasDoEdital({
    analise: ctx.tender.analysis ? { status: ctx.tender.analysis.status, resultado: ctx.tender.analysis.resultado } : null,
    rawJson: ctx.tender.rawJson,
    criteriosDosItens: ctx.tender.items.map((i) => i.criterioJulgamento),
  })
  const passo = passoDosLances(Number(acompanhamento.decrementoPct), doEdital.intervaloMinimo)
  const regras = regrasEfetivas({ decrementoPct: Number(acompanhamento.decrementoPct), maxLances: acompanhamento.maxLances }, passo)
  const planoSalvo = lerPlanoSalvo(acompanhamento.planoDeDisputa)
  const painelDosAlvos = alvos.map((a) => {
    const doAlvo = lances.filter((l) => l.alvo === a.id)
    const maisRecente = doAlvo[0]
    const meusValores = doAlvo.filter((l) => l.origem === 'MEU_LANCE').map((l) => Number(l.valor))
    const meus = meusValores.length
    const meuMenor = meus > 0 ? Math.min(...meusValores) : null
    const melhorInformado = doAlvo.find((l) => l.origem === 'MELHOR_LANCE')
    const avaliacao: Avaliacao | null = !maisRecente
      ? null
      : maisRecente.origem === 'MEU_LANCE'
        ? avaliarMeuLance(Number(maisRecente.valor), a.limites, regras, meus)
        : avaliarLance(Number(maisRecente.valor), a.limites, regras, meus, meuMenor)
    const escolha = escolhaDe(planoSalvo, a.id)
    const valorFinal = valorFinalMinimo(a.limites, escolha.base)
    return {
      id: a.id,
      rotulo: a.rotulo,
      numero: a.numero,
      quantidade: a.quantidade,
      precoProposto: a.precoProposto,
      custo: Math.round(a.limites.custoComRateio * 100) / 100,
      ...limitesDoAlvo(a.limites),
      meusLances: meus,
      melhorLance: melhorInformado ? Number(melhorInformado.valor) : null,
      meuMenorLance: meuMenor,
      avaliacao,
      planoDeDisputa: {
        base: escolha.base,
        valorFinalMinimo: valorFinal.valor,
        lucroZero: valorFinal.lucroZero,
        cadastradoEm: escolha.cadastradoEm,
        desatualizado: desatualizado(escolha, valorFinal.valor),
      },
    }
  })

  return {
    tender: { id: ctx.tender.id, orgao: ctx.tender.orgao, numeroControle: ctx.tender.numeroControle, objeto: ctx.tender.objetoResumido ?? ctx.tender.objeto.slice(0, 300) },
    semCustos: base <= 0,
    impostosPct: dados.impostosPct,
    margemDesejadaPct: dados.margemDesejadaPct,
    config: {
      decrementoPct: passo.configuradoPct,
      maxLances: regras.maxLances,
      criterio: acompanhamento.criterio,
      resultado: acompanhamento.resultado,
      valorFinal: num(acompanhamento.valorFinal),
      encerradoEm: acompanhamento.encerradoEm,
    },
    regras,
    disputa: {
      analise: ctx.tender.analysis?.status ?? null,
      analisado: doEdital.analisado,
      vedacaoARobo: doEdital.vedacaoARobo !== null,
      decrementoAjustado: passo.ajustado,
      avisoDoDecremento: passo.aviso,
      checklist: checklistDaDisputa(doEdital, passo),
    },
    robo: {
      ativo: acompanhamento.roboAtivo,
      intervaloLancesSeg: acompanhamento.intervaloLancesSeg,
      disponivel: doEdital.vedacaoARobo === null,
      instrucoes: planejarRobo(
        painelDosAlvos.map((a) => ({
          id: a.id,
          rotulo: a.rotulo,
          melhorLance: a.melhorLance,
          meuMenorLance: a.meuMenorLance,
          piso: a.planoDeDisputa.valorFinalMinimo,
          meusLances: a.meusLances,
        })),
        regras
      ),
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
    const avaliacao = avaliarLance(valor, alvo.limites, painel.regras, meus)
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
  roboAtivo: z.boolean().optional(),
  intervaloLancesSeg: z.number().int().min(5).max(120).optional(),
})

pregaoRouter.put(
  '/config',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const config = configSchema.parse(req.body)
    await carregar(req.companyId!, req.params.id)
    const anterior = await acompanhamentoDe(req.companyId!, req.params.id)
    await prisma.pregaoAcompanhamento.update({ where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } }, data: config })
    if (config.roboAtivo !== undefined && config.roboAtivo !== anterior.roboAtivo) {
      await registrarAuditoria(req, {
        action: config.roboAtivo ? 'PREGAO_ROBO_ATIVADO' : 'PREGAO_ROBO_DESATIVADO',
        entityType: 'tender',
        entityId: req.params.id,
      })
    }
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

const planoSchema = z
  .object({
    alvo: z.string().min(1).max(64),
    base: z.enum(['MARGEM', 'EQUILIBRIO']).optional(),
    cadastradoNoPortal: z.boolean().optional(),
  })
  .refine((p) => p.base !== undefined || p.cadastradoNoPortal !== undefined, { message: 'Informe o que mudar no plano de disputa.' })

pregaoRouter.put(
  '/plano',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const pedido = planoSchema.parse(req.body)
    const painel = await montarPainel(req.companyId!, req.params.id)
    const alvo = painel.alvosConhecidos.find((a) => a.id === pedido.alvo)
    if (!alvo) throw new ApiError(400, 'Item do pregão não encontrado')
    if (painel.config.encerradoEm) throw new ApiError(409, 'Este pregão já foi encerrado. Reabra para mudar o plano de disputa.')

    const acompanhamento = await acompanhamentoDe(req.companyId!, req.params.id)
    const plano = lerPlanoSalvo(acompanhamento.planoDeDisputa)
    const anterior = escolhaDe(plano, alvo.id)
    const base = pedido.base ?? anterior.base
    const valor = valorFinalMinimo(alvo.limites, base).valor
    const mudouBase = base !== anterior.base
    const estavaCadastrado = anterior.cadastradoEm !== null
    if (pedido.cadastradoNoPortal && valor === null) throw new ApiError(409, 'Preencha os custos no estudo de custos antes de definir o valor final mínimo.')
    plano[alvo.id] =
      pedido.cadastradoNoPortal === true
        ? { base, cadastradoEm: new Date().toISOString(), valorCadastrado: valor }
        : pedido.cadastradoNoPortal === false
          ? { base, cadastradoEm: null, valorCadastrado: null }
          : { ...anterior, base }
    await prisma.pregaoAcompanhamento.update({ where: { id: acompanhamento.id }, data: { planoDeDisputa: plano as unknown as Prisma.InputJsonValue } })

    const entidade = { entityType: 'tender', entityId: req.params.id }
    if (mudouBase) await registrarAuditoria(req, { action: 'PREGAO_PLANO_ALTERADO', ...entidade, metadata: { alvo: alvo.id, base } })
    if (pedido.cadastradoNoPortal === true) await registrarAuditoria(req, { action: 'PREGAO_VALOR_FINAL_MINIMO_DEFINIDO', ...entidade, metadata: { alvo: alvo.id, base } })
    else if (pedido.cadastradoNoPortal === false && estavaCadastrado) await registrarAuditoria(req, { action: 'PREGAO_VALOR_FINAL_MINIMO_DESMARCADO', ...entidade, metadata: { alvo: alvo.id } })
    res.json(publico(await montarPainel(req.companyId!, req.params.id)))
  })
)

const copiaSchema = z.object({ alvo: z.string().min(1).max(64) })

pregaoRouter.post(
  '/plano/copiado',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { alvo } = copiaSchema.parse(req.body)
    const painel = await montarPainel(req.companyId!, req.params.id)
    const doAlvo = painel.alvos.find((a) => a.id === alvo)
    if (!doAlvo) throw new ApiError(400, 'Item do pregão não encontrado')
    await registrarAuditoria(req, { action: 'PREGAO_VALOR_FINAL_MINIMO_COPIADO', entityType: 'tender', entityId: req.params.id, metadata: { alvo, base: doAlvo.planoDeDisputa.base } })
    res.status(204).end()
  })
)
