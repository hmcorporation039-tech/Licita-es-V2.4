// ============================================================
// workers/coletorFieg.ts — Coleta o Sistema FIEG (Sistema S — não segue
// a Lei 14.133, não está garantido no PNCP). Paginado por query string,
// ~20 itens por página.
// ============================================================

import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { fiegClient } from '../lib/httpClient'
import { parseFiegListagem, extrairTotalPaginas } from '../services/fiegParser'
import { saveWorkerLog } from '../services/tenderService'
import { salvarLote } from './coletorHtmlShared'

// Teto de segurança: se o parser de total de páginas errar por algum motivo
// (mudança no site), isso evita um loop sem fim gastando requisição à toa.
const MAX_PAGINAS = 50

export function startColetorFiegWorker() {
  const worker = new Worker(
    'coletor-fieg',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let hadErrors = false

      try {
        let pagina = 1
        let totalPaginas = 1
        while (pagina <= totalPaginas && pagina <= MAX_PAGINAS) {
          const response = await fiegClient.get('/licitacao/site/Cotacao.do', {
            params: { acao: 'listarCotacao', page: pagina },
          })
          const html: string = response.data
          totalPaginas = extrairTotalPaginas(html)

          const tenders = parseFiegListagem(html)
          totalFetched += tenders.length

          const result = await salvarLote(tenders, 'FIEG Worker')
          totalNew += result.totalNew
          totalDupes += result.totalDupes
          totalUpdated += result.totalUpdated

          pagina++
        }
      } catch (err) {
        hadErrors = true
        console.error('[FIEG Worker] Erro na coleta:', err)
      }

      await saveWorkerLog({
        worker: 'coletor-fieg',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'FIEG',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'A coleta parou antes do fim — ver logs do worker' : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[FIEG Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000, // 5min
      lockDuration: 600_000, // 10min — até 50 páginas
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[FIEG Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
