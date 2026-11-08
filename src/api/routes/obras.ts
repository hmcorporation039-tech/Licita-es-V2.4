// ============================================================
// api/routes/obras.ts — "Obras e ganhadores": a empresa cadastra os nichos que
// atende e a região, e vê quem acabou de ganhar contrato perto dela (PNCP),
// com o contato público do ganhador e uma mensagem de apresentação pronta.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoCalculoLimiter, radarLimiter } from '../rateLimit'
import {
  CATALOGO_DE_NICHOS,
  MAX_NICHOS,
  compilarNichos,
  limparPalavras,
  mensagemDeApresentacao,
  naRegiao,
  nichosDoContrato,
  regiaoValida,
  type RegiaoDaEmpresa,
} from '../../lib/obrasEGanhadores'
import { termosDoPreFiltro } from '../../lib/matching'
import { PLANO_DE_TESTE } from '../../lib/acessoEncerrado'
import { CnpjIndisponivel, CnpjNaoEncontrado, consultarCnpj, normalizarCnpj } from '../../services/perfilDoNegocio'

export const obrasRouter = Router()

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const
const RAIO_PADRAO_KM = 150
const MAX_CANDIDATOS = 3000
const MAX_RESULTADOS = 200
// Plano gratuito (teste): vê uma amostra da lista; contato e mensagem só nos planos pagos.
export const AMOSTRA_NO_PLANO_GRATUITO = 5
export const MENSAGEM_SO_NOS_PLANOS = 'Ver o contato do ganhador e a mensagem pronta é liberado nos planos pagos. Assine em Minha conta para usar.'

function noPlanoGratuito(planCode: string, isAdmin: boolean | undefined): boolean {
  return planCode === PLANO_DE_TESTE && isAdmin !== true
}

async function exigirPlanoPago(companyId: string, isAdmin: boolean | undefined) {
  const { planCode } = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { planCode: true } })
  if (noPlanoGratuito(planCode, isAdmin)) throw new ApiError(403, MENSAGEM_SO_NOS_PLANOS, { code: 'OBRAS_SO_NOS_PLANOS' })
}

async function perfilDaEmpresa(companyId: string) {
  const [empresa, perfil, nichos] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, baseMunicipio: true, baseUf: true, baseLat: true, baseLng: true, telefone: true, email: true, planCode: true } }),
    prisma.perfilDeObras.findUnique({ where: { companyId } }),
    prisma.nichoDeObras.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
  ])
  const regiao: RegiaoDaEmpresa = {
    raioKm: perfil ? perfil.raioKm : RAIO_PADRAO_KM,
    ufs: perfil?.ufs ?? [],
    base: empresa.baseLat !== null && empresa.baseLng !== null ? { lat: empresa.baseLat, lng: empresa.baseLng } : null,
  }
  return { empresa, perfil, nichos, regiao, valorMinimo: perfil?.valorMinimo != null ? Number(perfil.valorMinimo) : null }
}

obrasRouter.get(
  '/perfil',
  asyncHandler(async (req, res) => {
    const { empresa, perfil, nichos, regiao, valorMinimo } = await perfilDaEmpresa(req.companyId!)
    res.json({
      configurado: perfil !== null && nichos.length > 0,
      base: empresa.baseMunicipio ? { municipio: empresa.baseMunicipio, uf: empresa.baseUf, temCoordenadas: regiao.base !== null } : null,
      regiao: { raioKm: regiao.raioKm, ufs: regiao.ufs, valorMinimo },
      nichos: nichos.map((n) => ({ id: n.id, nome: n.nome, alvos: n.alvos, exclusoes: n.exclusoes })),
      catalogo: CATALOGO_DE_NICHOS,
    })
  })
)

const nichoSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  alvos: z.array(z.string().max(60)).min(1).max(60),
  exclusoes: z.array(z.string().max(60)).max(60).default([]),
})

const perfilSchema = z.object({
  raioKm: z.number().int().min(10).max(1500).nullable(),
  ufs: z.array(z.enum(UFS)).max(27).default([]),
  valorMinimo: z.number().finite().min(0).max(1e11).nullable().default(null),
  nichos: z.array(nichoSchema).min(1).max(MAX_NICHOS),
})

obrasRouter.put(
  '/perfil',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const dados = perfilSchema.parse(req.body)
    const { regiao } = await perfilDaEmpresa(req.companyId!)
    const ufs = [...new Set(dados.ufs)]
    const problema = regiaoValida({ raioKm: dados.raioKm, ufs, base: regiao.base })
    if (problema) throw new ApiError(400, problema)
    const nichos = dados.nichos
      .map((n) => ({ nome: n.nome, alvos: limparPalavras(n.alvos), exclusoes: limparPalavras(n.exclusoes) }))
      .filter((n) => n.alvos.length > 0)
    if (nichos.length === 0) throw new ApiError(400, 'Cada nicho precisa de pelo menos uma palavra válida (3 letras ou mais).')
    const companyId = req.companyId!
    await prisma.$transaction([
      prisma.perfilDeObras.upsert({
        where: { companyId },
        create: { companyId, raioKm: dados.raioKm, ufs, valorMinimo: dados.valorMinimo },
        update: { raioKm: dados.raioKm, ufs, valorMinimo: dados.valorMinimo },
      }),
      prisma.nichoDeObras.deleteMany({ where: { companyId } }),
      prisma.nichoDeObras.createMany({ data: nichos.map((n) => ({ companyId, ...n })) }),
    ])
    res.json({ ok: true })
  })
)

// Caixa em graus em volta da base: pré-filtro no banco antes da distância exata.
function caixaDoRaio(base: { lat: number; lng: number }, raioKm: number) {
  const dLat = raioKm / 111
  const dLng = raioKm / (111 * Math.max(0.2, Math.cos((base.lat * Math.PI) / 180)))
  return { lat: { gte: base.lat - dLat, lte: base.lat + dLat }, lng: { gte: base.lng - dLng, lte: base.lng + dLng } }
}

const consultaSchema = z.object({
  dias: z.coerce.number().int().min(7).max(180).default(60),
  nicho: z.string().max(80).optional(),
})

obrasRouter.get(
  '/oportunidades',
  radarLimiter,
  asyncHandler(async (req, res) => {
    const q = consultaSchema.parse(req.query)
    const { empresa, nichos, regiao, valorMinimo } = await perfilDaEmpresa(req.companyId!)
    if (nichos.length === 0) {
      res.json({ configurado: false, contratos: [], total: 0 })
      return
    }
    const problema = regiaoValida(regiao)
    if (problema) throw new ApiError(400, problema)

    const escolhidos = q.nicho ? nichos.filter((n) => n.nome === q.nicho) : nichos
    const compilados = compilarNichos(escolhidos)
    const termos = [...new Set(escolhidos.flatMap((n) => n.alvos.flatMap(termosDoPreFiltro)))].slice(0, 80)
    const desde = new Date(Date.now() - q.dias * 24 * 60 * 60 * 1000)

    const ondeRegiao: Prisma.ContratoPublicoWhereInput[] = []
    if (regiao.ufs.length > 0) ondeRegiao.push({ uf: { in: regiao.ufs } })
    if (regiao.raioKm !== null && regiao.base) ondeRegiao.push(caixaDoRaio(regiao.base, regiao.raioKm))
    const candidatos = await prisma.contratoPublico.findMany({
      where: {
        dataAssinatura: { gte: desde },
        ...(valorMinimo ? { valorGlobal: { gte: valorMinimo } } : {}),
        AND: [{ OR: ondeRegiao }, { OR: termos.map((t) => ({ objetoNorm: { contains: t } })) }],
      },
      orderBy: { dataAssinatura: 'desc' },
      take: MAX_CANDIDATOS,
    })

    const todos = candidatos
      .flatMap((c) => {
        const local = naRegiao(regiao, { uf: c.uf, lat: c.lat, lng: c.lng })
        if (!local.dentro) return []
        const casados = nichosDoContrato({ objetoNorm: c.objetoNorm, categoria: c.categoria }, compilados)
        if (casados.length === 0) return []
        return [
          {
            id: c.id,
            fornecedor: { cnpj: c.fornecedorNi, nome: c.fornecedorNome },
            orgao: c.orgaoNome,
            objeto: c.objeto,
            valor: Number(c.valorGlobal),
            categoria: c.categoria,
            municipio: c.municipio,
            uf: c.uf,
            distanciaKm: local.distanciaKm,
            assinatura: c.dataAssinatura?.toISOString().slice(0, 10) ?? null,
            vigenciaFim: c.vigenciaFim?.toISOString().slice(0, 10) ?? null,
            nichos: casados.map((n) => n.nome),
            linkPncp: linkDoContrato(c.id),
          },
        ]
      })
      .slice(0, MAX_RESULTADOS)

    const gratuito = noPlanoGratuito(empresa.planCode, req.isAdmin)
    const contratos = gratuito ? todos.slice(0, AMOSTRA_NO_PLANO_GRATUITO) : todos
    const ultimaColeta = await prisma.coletaDeContratosDia.findFirst({ orderBy: { atualizadoEm: 'desc' }, select: { atualizadoEm: true } })
    res.json({
      configurado: true,
      contratos,
      total: todos.length,
      planoGratuito: gratuito ? { mostrados: contratos.length, total: todos.length } : null,
      atualizadoEm: ultimaColeta?.atualizadoEm ?? null,
    })
  })
)

// "07854402000100-2-000123/2026" -> página do contrato no PNCP.
export function linkDoContrato(id: string): string | null {
  const m = id.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/)
  return m ? `https://pncp.gov.br/app/contratos/${m[1]}/${m[3]}/${Number(m[2])}` : null
}

obrasRouter.get(
  '/ganhador/:cnpj',
  radarLimiter,
  asyncHandler(async (req, res) => {
    await exigirPlanoPago(req.companyId!, req.isAdmin)
    const cnpj = normalizarCnpj(req.params.cnpj)
    if (!cnpj) throw new ApiError(400, 'CNPJ inválido.')
    const contratos = await prisma.contratoPublico.count({ where: { fornecedorNi: cnpj } })
    try {
      const e = await consultarCnpj(cnpj)
      res.json({
        cnpj,
        razaoSocial: e.razaoSocial,
        nomeFantasia: e.nomeFantasia,
        municipio: e.municipio,
        uf: e.uf,
        telefones: e.telefones ?? [],
        email: e.email ?? null,
        situacao: e.situacao ?? null,
        contratosRecentes: contratos,
      })
    } catch (err) {
      if (err instanceof CnpjNaoEncontrado) throw new ApiError(404, err.message)
      if (err instanceof CnpjIndisponivel) throw new ApiError(503, 'A consulta do CNPJ não respondeu agora. Tente de novo em instantes.')
      throw err
    }
  })
)

obrasRouter.get(
  '/mensagem/:id',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    await exigirPlanoPago(req.companyId!, req.isAdmin)
    const id = decodeURIComponent(String(req.params.id))
    const [contrato, { empresa, nichos }] = await Promise.all([prisma.contratoPublico.findUnique({ where: { id } }), perfilDaEmpresa(req.companyId!)])
    if (!contrato) throw new ApiError(404, 'Contrato não encontrado.')
    const meusNichos = nichosDoContrato({ objetoNorm: contrato.objetoNorm, categoria: contrato.categoria }, compilarNichos(nichos)).map((n) => n.nome)
    const contato = [empresa.telefone, empresa.email].filter(Boolean).join(' · ') || null
    res.json({
      texto: mensagemDeApresentacao({
        fornecedor: contrato.fornecedorNome,
        orgao: contrato.orgaoNome,
        objeto: contrato.objeto,
        municipio: contrato.municipio,
        uf: contrato.uf,
        valor: Number(contrato.valorGlobal),
        minhaEmpresa: empresa.name,
        minhaCidade: empresa.baseMunicipio ? `${empresa.baseMunicipio}${empresa.baseUf ? `/${empresa.baseUf}` : ''}` : null,
        meusNichos: meusNichos.length > 0 ? meusNichos : nichos.map((n) => n.nome),
        meuContato: contato,
      }),
    })
  })
)
