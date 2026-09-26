// ============================================================
// workers/analise.ts — Agente de análise de edital.
// A análise leva minutos (download de vários PDFs + modelo com effort
// alto); rodando dentro da requisição HTTP, o proxy cortava antes e o
// usuário via erro enquanto a análise seguia rodando e sendo paga.
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../queues'
import { runEditalAnalysis } from '../services/editalAnalysisService'
import { AnaliseJobPayload } from '../types'

export function startAnaliseWorker() {
  const worker = new Worker<AnaliseJobPayload>(
    'analise',
    async (job: Job<AnaliseJobPayload>) => {
      await runEditalAnalysis(job.data.tenderId)
    },
    {
      connection: redisConnection,
      // Uma de cada vez: cada análise carrega vários PDFs em memória.
      concurrency: 1,
      stalledInterval: 300_000,
      lockDuration: 900_000, // 15min — cobre um edital grande inteiro
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Análise Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
