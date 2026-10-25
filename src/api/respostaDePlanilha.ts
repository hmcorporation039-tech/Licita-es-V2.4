import type { Request, Response } from 'express'
import { registrarAuditoria } from '../services/auditService'
import { diaDeBrasilia } from '../lib/dataDeBrasilia'
import { TIPO_DO_XLSX } from '../lib/planilhaXlsx'

export type TipoDePlanilhaExportada = 'matches' | 'escolhidas' | 'base-de-precos'

export function nomeDoArquivoDaPlanilha(tipo: TipoDePlanilhaExportada, agora: Date = new Date()): string {
  return `licita-bela-${tipo}-${diaDeBrasilia(agora)}.xlsx`
}

export async function responderComPlanilha(req: Request, res: Response, tipo: TipoDePlanilhaExportada, linhas: number, conteudo: Uint8Array): Promise<void> {
  await registrarAuditoria(req, {
    action: 'EXPORTACAO_PLANILHA',
    entityType: 'empresa',
    entityId: req.companyId!,
    metadata: { tipo, linhas },
  })
  res.setHeader('Content-Type', TIPO_DO_XLSX)
  res.setHeader('Content-Disposition', `attachment; filename="${nomeDoArquivoDaPlanilha(tipo)}"`)
  res.setHeader('Content-Length', String(conteudo.byteLength))
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(Buffer.from(conteudo.buffer, conteudo.byteOffset, conteudo.byteLength))
}
