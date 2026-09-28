// ============================================================
// workers/coletorSescGo.ts — Coleta o SESC Goiás (Sistema S — TCU já
// decidiu que o SESC não segue a Lei 14.133, não está garantido no PNCP).
// Página única sem paginação — o site devolve o histórico inteiro numa
// carga só (~15 MB); o dedupe por content hash em saveTender() é quem
// evita reprocessar o que não mudou.
// ============================================================

import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { sescGoClient } from '../lib/httpClient'
import { parseSescGoListagem } from '../services/sescGoParser'
import { saveWorkerLog } from '../services/tenderService'
import { salvarLote } from './coletorHtmlShared'

export function startColetorSescGoWorker() {
  const worker = new Worker(
    'coletor-sesc-go',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let hadErrors = false
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0

      try {
        const response = await sescGoClient.get('/licitacoes')
        const tenders = parseSescGoListagem(response.data)
        totalFetched = tenders.length

        const result = await salvarLote(tenders, 'SESC GO Worker')
        totalNew = result.totalNew
        totalDupes = result.totalDupes
        totalUpdated = result.totalUpdated
      } catch (err) {
        hadErrors = true
        console.error('[SESC GO Worker] Erro na coleta:', err)
      }

      await saveWorkerLog({
        worker: 'coletor-sesc-go',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'SESC_GO',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'A coleta falhou — ver logs do worker' : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[SESC GO Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000, // 5min
      lockDuration: 300_000, // 5min — página única
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[SESC GO Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
