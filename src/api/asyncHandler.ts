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
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
