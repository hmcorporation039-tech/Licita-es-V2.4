// ============================================================
// api/routes/portalNaBela.ts — "Portal dentro da Bela": o portal de compras abre num
// navegador da Bela (serviço `src/navegador`) e a imagem aparece dentro da página do
// pregão, ao lado do painel da Bela. Quem entra no portal é a pessoa: ela mesma digita
// a senha e resolve o CAPTCHA na tela espelhada. A Bela não guarda senha nem sessão.
//
// Aqui a API só diz se o recurso está ligado e autoriza a sessão: o serviço navegador
// chama POST /sessao com o token da pessoa antes de abrir o navegador.
// ============================================================

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { PLANO_DE_TESTE } from '../../lib/acessoEncerrado'

export const portalNaBelaRouter = Router()

// Por onde a pessoa começa: o login do fornecedor no Compras.gov.br (gov.br).
export const INICIO_DO_PORTAL = 'https://www.comprasnet.gov.br/seguro/loginPortal.asp'

export function urlDoNavegador(): string | null {
  const url = process.env.NAVEGADOR_URL?.trim()
  if (!url) return null
  // O navegador fala por WebSocket: https -> wss.
  return url.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`).replace(/\/+$/, '')
}

portalNaBelaRouter.get(
  '/config',
  asyncHandler(async (req, res) => {
    const empresa = await prisma.company.findUniqueOrThrow({ where: { id: req.companyId! }, select: { planCode: true } })
    const url = urlDoNavegador()
    res.json({
      disponivel: url !== null,
      url,
      planoGratuito: empresa.planCode === PLANO_DE_TESTE && req.isAdmin !== true,
    })
  })
)

const sessaoSchema = z.object({ tenderId: z.string().uuid() })

portalNaBelaRouter.post(
  '/sessao',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { tenderId } = sessaoSchema.parse(req.body)
    if (!urlDoNavegador()) throw new ApiError(503, 'O portal dentro da Bela ainda não foi ativado.', { code: 'NAVEGADOR_NAO_CONFIGURADO' })
    const companyId = req.companyId!
    const empresa = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { planCode: true } })
    if (empresa.planCode === PLANO_DE_TESTE && req.isAdmin !== true) {
      throw new ApiError(403, 'O portal dentro da Bela é liberado nos planos pagos. Assine em Minha conta para usar.', { code: 'PORTAL_SO_NOS_PLANOS' })
    }
    const plano = await prisma.tenderParticipationPlan.findUnique({ where: { companyId_tenderId: { companyId, tenderId } }, select: { status: true } })
    if (plano?.status !== 'VOU_PARTICIPAR') throw new ApiError(409, 'Abra o portal pela licitação escolhida ("Vou participar").')
    await registrarAuditoria(req, { action: 'PORTAL_NA_BELA_ABERTO', entityType: 'tender', entityId: tenderId })
    res.json({ userId: req.userId, companyId, tenderId, inicio: process.env.NAVEGADOR_INICIO?.trim() || INICIO_DO_PORTAL })
  })
)
