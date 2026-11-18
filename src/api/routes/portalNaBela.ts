// ============================================================
// api/routes/portalNaBela.ts — "Portal dentro da Bela": o portal de compras abre num
// navegador da Bela (serviço `src/navegador`) e a imagem aparece dentro da página do
// pregão, ao lado do painel da Bela. Funciona com todos os portais de Meus Portais.
//
// Quem entra no portal é a pessoa: ela resolve o CAPTCHA e clica em "Entrar". Quando ela
// pede, a Bela escreve no formulário de login o acesso salvo em Meus Portais (como um
// gerenciador de senhas). A senha vai da API direto para o serviço navegador, nunca para
// o site, e não fica guardada no navegador: ao fechar, a sessão é apagada.
// ============================================================

import { timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoCalculoLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { acessoParaPreencher } from '../../services/meusPortais'
import { PORTAIS, hostsDosPortais, inicioNoPortal, portalDaLicitacao, portalDoHost, portalPorId } from '../../lib/portais'

export const portalNaBelaRouter = Router()

// Mantido para quem ainda configura NAVEGADOR_INICIO (abre sempre esta página no Compras.gov.br).
export const INICIO_DO_PORTAL = 'https://www.comprasnet.gov.br/seguro/loginPortal.asp'

export function urlDoNavegador(): string | null {
  const url = process.env.NAVEGADOR_URL?.trim()
  if (!url) return null
  // O navegador fala por WebSocket: https -> wss.
  return url.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`).replace(/\/+$/, '')
}

// O portal dentro da Bela vale também no período de teste: é o que mais mostra o valor
// do sistema para quem está experimentando. Quando o teste acaba, o acesso todo é
// encerrado pelo authMiddleware, então não há uso gratuito sem prazo.
async function conferirPlano(_req: Request): Promise<void> {
  if (!urlDoNavegador()) throw new ApiError(503, 'O portal dentro da Bela ainda não foi ativado.', { code: 'NAVEGADOR_NAO_CONFIGURADO' })
}

/**
 * Com licitação: a licitação marcada "Vou participar" (como sempre).
 * Sem licitação (modo "conferir acesso", aberto de Meus Portais): basta o navegador ligado. Nesse
 * modo o navegador não lê disputa nem preenche lance: serve para a pessoa conferir o login.
 */
async function conferirAcesso(req: Request, tenderId: string | undefined): Promise<void> {
  await conferirPlano(req)
  if (!tenderId) return
  const plano = await prisma.tenderParticipationPlan.findUnique({
    where: { companyId_tenderId: { companyId: req.companyId!, tenderId } },
    select: { status: true },
  })
  if (plano?.status !== 'VOU_PARTICIPAR') throw new ApiError(409, 'Abra o portal pela licitação escolhida ("Vou participar").')
}

const configSchema = z.object({ tenderId: z.string().uuid().optional() })

portalNaBelaRouter.get(
  '/config',
  asyncHandler(async (req, res) => {
    const { tenderId } = configSchema.parse(req.query)
    const url = urlDoNavegador()
    const comAcesso = await prisma.portalCredencial.findMany({
      where: { companyId: req.companyId!, consentimentoEm: { not: null } },
      select: { portal: true },
    })
    const salvos = new Set(comAcesso.map((c) => c.portal))
    let portalSugerido: string | null = null
    let linkEdital: string | null = null
    if (tenderId) {
      const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { linkEdital: true, plataformaDeOrigem: true, fonte: true } })
      if (tender) {
        portalSugerido = portalDaLicitacao(tender)?.id ?? null
        linkEdital = tender.linkEdital
      }
    }
    res.json({
      disponivel: url !== null,
      url,
      // Mantido para telas antigas em cache: o portal agora vale também no teste.
      planoGratuito: false,
      // abreAqui: o portal aceita o navegador da Bela. Os outros abrem numa aba do Chrome
      // da pessoa (endereco), onde a extensão Bela lê a disputa e preenche o lance.
      portais: PORTAIS.map((p) => ({ id: p.id, nome: p.nome, temAcessoSalvo: salvos.has(p.id), abreAqui: p.abreDentroDaBela, endereco: inicioNoPortal(p, linkEdital) })),
      portalSugerido,
    })
  })
)

const sessaoSchema = z.object({ tenderId: z.string().uuid().optional(), portal: z.string().max(40).optional() })

portalNaBelaRouter.post(
  '/sessao',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    const { tenderId, portal: pedido } = sessaoSchema.parse(req.body)
    if (!tenderId) {
      // Modo "conferir acesso" (Meus Portais): sem licitação, o portal é obrigatório e
      // precisa aceitar o navegador da Bela.
      const portal = pedido ? portalPorId(pedido) : null
      if (!portal || portal.id !== pedido) throw new ApiError(400, 'Portal não suportado.')
      if (!portal.abreDentroDaBela) throw new ApiError(400, `O ${portal.nome} não aceita o navegador da Bela. Abra no seu Chrome.`, { code: 'PORTAL_NAO_ABRE_AQUI' })
      await conferirAcesso(req, undefined)
      const inicioFixo = portal.id === 'COMPRASNET' ? process.env.NAVEGADOR_INICIO?.trim() : undefined
      await registrarAuditoria(req, { action: 'PORTAL_NA_BELA_ABERTO', entityType: 'portal', entityId: portal.id, metadata: { modo: 'conferir-acesso', portal: portal.id } })
      res.json({
        userId: req.userId,
        companyId: req.companyId,
        tenderId: null,
        portal: portal.id,
        nomeDoPortal: portal.nome,
        inicio: inicioFixo || inicioNoPortal(portal, null),
        hostsPermitidos: hostsDosPortais(),
      })
      return
    }
    await conferirAcesso(req, tenderId)
    const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { linkEdital: true, plataformaDeOrigem: true, fonte: true } })
    if (!tender) throw new ApiError(404, 'Licitação não encontrada.')
    const portal = (pedido ? portalPorId(pedido) : null) ?? portalDaLicitacao(tender) ?? portalPorId('COMPRASNET')!
    if (pedido && portal.id !== pedido) throw new ApiError(400, 'Portal não suportado.')
    const inicioFixo = portal.id === 'COMPRASNET' ? process.env.NAVEGADOR_INICIO?.trim() : undefined
    await registrarAuditoria(req, { action: 'PORTAL_NA_BELA_ABERTO', entityType: 'tender', entityId: tenderId, metadata: { portal: portal.id } })
    res.json({
      userId: req.userId,
      companyId: req.companyId,
      tenderId,
      portal: portal.id,
      nomeDoPortal: portal.nome,
      inicio: inicioFixo || inicioNoPortal(portal, tender.linkEdital),
      hostsPermitidos: hostsDosPortais(),
    })
  })
)

// ---------- login salvo (só o serviço navegador chama) ----------

function segredoConfere(recebido: string | undefined): boolean {
  const esperado = process.env.NAVEGADOR_SEGREDO?.trim()
  if (!esperado || esperado.length < 16 || !recebido) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recebido)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Qual portal está na tela: pelo domínio da página. O login do gov.br (acesso.gov.br)
 * é o do Compras.gov.br.
 */
export function portalDaTela(host: string): string | null {
  const porHost = portalDoHost(host)
  if (porHost) return porHost.id
  const h = host.toLowerCase()
  return h === 'gov.br' || h.endsWith('.gov.br') ? 'COMPRASNET' : null
}

const acessoSchema = z.object({ tenderId: z.string().uuid().optional(), host: z.string().min(1).max(253) })

portalNaBelaRouter.post(
  '/acesso-salvo',
  estudoCalculoLimiter,
  asyncHandler(async (req, res) => {
    // Só o serviço navegador conhece este segredo: um token roubado do site não basta para ler a senha.
    if (!segredoConfere(req.header('x-navegador-segredo') ?? undefined)) {
      throw new ApiError(403, 'O preenchimento do login ainda não foi ativado (NAVEGADOR_SEGREDO).', { code: 'SEGREDO_DO_NAVEGADOR' })
    }
    const { tenderId, host } = acessoSchema.parse(req.body)
    await conferirAcesso(req, tenderId)
    const portal = portalDaTela(host)
    if (!portal) throw new ApiError(404, 'Esta página não é de um portal de Meus Portais.', { code: 'PORTAL_DESCONHECIDO' })
    const acesso = await acessoParaPreencher(req.companyId!, portal)
    await registrarAuditoria(
      req,
      tenderId
        ? { action: 'PORTAL_NA_BELA_LOGIN_PREENCHIDO', entityType: 'tender', entityId: tenderId, metadata: { portal } }
        : { action: 'PORTAL_NA_BELA_LOGIN_PREENCHIDO', entityType: 'portal', entityId: portal, metadata: { modo: 'conferir-acesso', portal } }
    )
    res.set('cache-control', 'no-store')
    res.json({ portal, ...acesso })
  })
)
