// ============================================================
// api/authMiddleware.ts — Exige um token de sessão válido (Authorization:
// Bearer <token>) e resolve req.userId/req.user a partir dele — em vez de
// confiar num userId que o próprio cliente manda no corpo/query (era assim
// antes: qualquer chamador podia passar o userId de outra pessoa e ler/
// escrever os dados dela).
// ============================================================

import { Request, Response, NextFunction } from 'express'
import { prisma } from '../services/tenderService'
import { verifySessionToken } from '../services/authService'
import { ApiError } from './asyncHandler'
import { empresaTemDonoComAcesso } from '../lib/acessoDaEmpresa'
import { PLANO_DE_TESTE, acessoExpirou, detalhesDoAcessoEncerrado, mensagemDeAcessoEncerrado } from '../lib/acessoEncerrado'
import { confirmacaoRecente, segundoFatorDoAdminExigido } from '../lib/segundoFator'
import { segundoFatorAtivo } from '../services/segundoFator'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      companyId?: string
      companyRole?: string
      isAdmin?: boolean
      segundoFatorAtivo?: boolean
      segundoFatorEm?: number
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
    if (!token) throw new ApiError(401, 'Não autenticado')

    const payload = verifySessionToken(token)
    if (!payload) throw new ApiError(401, 'Sessão inválida ou expirada — faça login novamente')

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        company: {
          select: {
            planCode: true,
            users: {
              where: { companyRole: 'OWNER' },
              select: { active: true, disabledByAdmin: true, accessExpiresAt: true },
            },
          },
        },
      },
    })
    if (!user || !user.active) throw new ApiError(401, 'Sessão inválida ou expirada — faça login novamente')
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Sessão encerrada — faça login novamente')
    }
    if (user.accessExpiresAt && acessoExpirou(user.accessExpiresAt)) {
      const planCode = user.company?.planCode
      throw new ApiError(403, mensagemDeAcessoEncerrado(user.accessExpiresAt, planCode === PLANO_DE_TESTE), detalhesDoAcessoEncerrado(user.accessExpiresAt, planCode))
    }
    if (!user.isAdmin && user.companyRole !== 'OWNER' && !empresaTemDonoComAcesso(user.company?.users ?? [])) {
      throw new ApiError(403, 'O acesso da sua empresa está suspenso — fale com o administrador')
    }

    req.userId = user.id
    req.companyId = user.companyId
    req.companyRole = user.companyRole
    req.isAdmin = user.isAdmin
    req.segundoFatorAtivo = segundoFatorAtivo(user)
    req.segundoFatorEm = payload.segundoFatorEm
    next()
  } catch (err) {
    next(err)
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    next(new ApiError(403, 'Apenas administradores podem fazer isso'))
    return
  }
  if (segundoFatorDoAdminExigido()) {
    if (!req.segundoFatorAtivo) {
      next(new ApiError(403, 'Ative o login em duas etapas em Minha conta para usar a administração.', { code: 'SEGUNDO_FATOR_PENDENTE' }))
      return
    }
    if (req.segundoFatorEm === undefined) {
      next(new ApiError(403, 'Saia e entre de novo com o código do aplicativo para usar a administração.', { code: 'SEGUNDO_FATOR_NECESSARIO' }))
      return
    }
  }
  next()
}

export function exigirConfirmacaoRecente(req: Request, _res: Response, next: NextFunction) {
  if (segundoFatorDoAdminExigido() && !confirmacaoRecente(req.segundoFatorEm, new Date())) {
    next(new ApiError(403, 'Digite o código do aplicativo para confirmar esta ação.', { code: 'SEGUNDO_FATOR_RECENTE' }))
    return
  }
  next()
}

// Dono da empresa (não confundir com isAdmin, que é o admin da plataforma
// inteira) — quem pode convidar/remover colega e editar os dados da empresa.
export function requireCompanyOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.companyRole !== 'OWNER') {
    next(new ApiError(403, 'Apenas o dono da empresa pode fazer isso'))
    return
  }
  next()
}
