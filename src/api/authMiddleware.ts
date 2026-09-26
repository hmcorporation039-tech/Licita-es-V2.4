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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      isAdmin?: boolean
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

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user || !user.active) throw new ApiError(401, 'Sessão inválida ou expirada — faça login novamente')
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Sessão encerrada — faça login novamente')
    }
    if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
      throw new ApiError(403, 'O acesso desta conta expirou — fale com o administrador')
    }

    req.userId = user.id
    req.isAdmin = user.isAdmin
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
  next()
}
