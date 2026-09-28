// ============================================================
// workers/coletorHtmlShared.ts — Loop de salvamento compartilhado pelos
// coletores de HTML da Etapa 5 (Novacap, FIEG, SESC GO). Diferente do
// PNCP/ComprasNet, esses três não têm filtro de data no servidor — cada
// coleta traz a listagem inteira, e quem decide o que é novo/alterado é
// o dedupe por content hash já existente em saveTender().
// ============================================================

import { matcherQueue } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { saveTender } from '../services/tenderService'
import { avisarAlteracaoDeTender } from '../services/tenderChangeService'
import { NormalizedTender } from '../types'

export interface SaveCounters {
  totalNew: number
  totalDupes: number
  totalUpdated: number
}

export async function salvarLote(tenders: NormalizedTender[], contexto: string): Promise<SaveCounters> {
  let totalNew = 0
  let totalDupes = 0
  let totalUpdated = 0

  for (const tender of tenders) {
    try {
      const result = await saveTender(tender)
      if (result.isNew) {
        totalNew++
        await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: result.tenderId }, contexto)
      } else {
        totalDupes++
        if (result.changed) {
          totalUpdated++
          await avisarAlteracaoDeTender(result.tenderId, result.changedFields)
        }
      }
    } catch (itemErr) {
      console.error(`[${contexto}] Erro ao processar item:`, itemErr)
    }
  }

  return { totalNew, totalDupes, totalUpdated }
}
