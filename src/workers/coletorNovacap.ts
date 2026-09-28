// ============================================================
// workers/coletorNovacap.ts — Coleta a Novacap (empresa pública do DF,
// Lei 13.303/2016 — não garantida no PNCP, ver Etapa 4 da análise de
// viabilidade). Uma sub-listagem por modalidade, sem paginação dentro
// de cada uma (ver NOVACAP_LISTAGENS em types/index.ts).
// ============================================================

import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { novacapClient } from '../lib/httpClient'
import { parseNovacapListagem } from '../services/novacapParser'
import { saveWorkerLog } from '../services/tenderService'
import { salvarLote } from './coletorHtmlShared'
import { NOVACAP_LISTAGENS } from '../types'

export function startColetorNovacapWorker() {
  const worker = new Worker(
    'coletor-novacap',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let hadErrors = false

      for (const listagem of NOVACAP_LISTAGENS) {
        try {
          const response = await novacapClient.get(`/licitalisting/${listagem.id}`)
          const tenders = parseNovacapListagem(response.data, listagem.modalidade)
          totalFetched += tenders.length

          const result = await salvarLote(tenders, 'Novacap Worker')
          totalNew += result.totalNew
          totalDupes += result.totalDupes
          totalUpdated += result.totalUpdated
        } catch (err) {
          hadErrors = true
          console.error(`[Novacap Worker] Erro na listagem "${listagem.label}":`, err)
        }
      }

      await saveWorkerLog({
        worker: 'coletor-novacap',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'NOVACAP',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'Uma ou mais listagens falharam — ver logs do worker' : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[Novacap Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000, // 5min
      lockDuration: 300_000, // 5min — 13 listagens, cada uma rápida
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Novacap Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
