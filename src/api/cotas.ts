// ============================================================
// api/cotas.ts — Ponte entre as rotas e o serviço de cotas: confere o limite
// do plano da empresa de quem chama e deixa rastro na auditoria quando barra.
// ============================================================

import type { Request } from 'express'
import { ApiError } from './asyncHandler'
import { exigirCota } from '../services/quotaService'
import { registrarAuditoria } from '../services/auditService'
import type { Recurso } from '../lib/planos'

export async function exigirCotaDaRequisicao(req: Request, recurso: Recurso): Promise<void> {
  try {
    await exigirCota(req.companyId!, recurso, req.isAdmin === true)
  } catch (err) {
    if (err instanceof ApiError && err.extra?.code === 'COTA_EXCEDIDA') {
      await registrarAuditoria(req, {
        action: 'COTA_EXCEDIDA',
        entityType: 'cota',
        entityId: recurso,
        metadata: { recurso, limite: err.extra.limite, usado: err.extra.usado },
      })
    }
    throw err
  }
}
