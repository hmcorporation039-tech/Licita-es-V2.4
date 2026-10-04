// ============================================================
// api/asyncHandler.ts — Evita try/catch repetido em toda rota async
// ============================================================

import { Request, Response, NextFunction, RequestHandler } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

export class ApiError extends Error {
  status: number
  // Campos extras devolvidos junto com a mensagem (ex.: code, limite) para o
  // front poder reagir sem interpretar texto.
  extra?: Record<string, unknown>
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}
