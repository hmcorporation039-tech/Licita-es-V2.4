import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { codigoDeRastreioValido } from '../lib/suporte'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      codigoDeRastreio?: string
    }
  }
}

export function atribuirCodigoDeRastreio(req: Request, res: Response, next: NextFunction) {
  const enviado = req.header('x-request-id')
  req.codigoDeRastreio = codigoDeRastreioValido(enviado) ? enviado : randomUUID()
  res.setHeader('X-Request-Id', req.codigoDeRastreio)
  next()
}
