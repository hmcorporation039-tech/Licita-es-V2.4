// ============================================================
// api/routes/radar.ts — Radar de oportunidades (Fase 3): contratos de um órgão
// que estão para vencer e dossiê de um concorrente, a partir do PNCP.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { buscarContratos, buscarContratosDoFornecedor, PncpIndisponivelError } from '../../services/pncpConsultaService'
import { contratosVencendo, montarDossie, sugerirPerfil } from '../../lib/radar'
import { ApiError, asyncHandler } from '../asyncHandler'

export const radarRouter = Router()

const soDigitos = (v: string) => v.replace(/\D/g, '')
const cnpjSchema = z.string().transform(soDigitos).refine((v) => v.length === 14, 'Informe um CNPJ com 14 dígitos')

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function comPncp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof PncpIndisponivelError) throw new ApiError(502, err.message)
    throw err
  }
}

const vencendoSchema = z.object({
  cnpjOrgao: cnpjSchema,
  dias: z.coerce.number().int().min(7).max(365).default(120),
  // todos=1 mostra também os contratos fora do ramo dos seus itens monitorados.
  todos: z.enum(['0', '1']).default('0'),
})

radarRouter.get(
  '/contratos-vencendo',
  asyncHandler(async (req, res) => {
    const { cnpjOrgao, dias, todos } = vencendoSchema.parse(req.query)
    const itens = await prisma.monitoredItem.findMany({ where: { companyId: req.companyId!, active: true }, select: { keywords: true } })
    const termos = [...new Set(itens.flatMap((i) => i.keywords))]

    const hoje = hojeISO()
    const contratos = await comPncp(() => buscarContratos({ cnpjOrgao }, hoje))
    const vencendo = contratosVencendo(contratos, hoje, dias, termos)

    res.json({
      cnpjOrgao,
      dias,
      termosUsados: termos,
      totalVencendo: vencendo.length,
      contratos: (todos === '1' || termos.length === 0 ? vencendo : vencendo.filter((c) => c.noSeuRamo)).slice(0, 200),
    })
  })
)

radarRouter.get(
  '/concorrente/:cnpj',
  asyncHandler(async (req, res) => {
    const ni = cnpjSchema.parse(req.params.cnpj)
    const hoje = hojeISO()
    const contratos = await comPncp(() => buscarContratosDoFornecedor(ni))
    res.json({ cnpj: ni, ...montarDossie(contratos, hoje) })
  })
)

// Perfilador: o que a empresa já vende ao governo (pelo CNPJ dela) vira sugestão de item monitorado.
radarRouter.get(
  '/perfil',
  asyncHandler(async (req, res) => {
    const empresa = await prisma.company.findUnique({ where: { id: req.companyId! }, select: { cnpj: true } })
    if (!empresa?.cnpj) throw new ApiError(400, 'O Perfilador usa o CNPJ da empresa. Cadastre o CNPJ em Empresa para gerar sugestões.')
    const contratos = await comPncp(() => buscarContratosDoFornecedor(empresa.cnpj!.replace(/D/g, '')))
    res.json(sugerirPerfil(contratos))
  })
)
