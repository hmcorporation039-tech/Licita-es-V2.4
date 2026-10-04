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

export function concorrenciaDaAnalise(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.ANALISE_CONCURRENCY)
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 2
}

export function startAnaliseWorker() {
  const worker = new Worker<AnaliseJobPayload>(
    'analise',
    async (job: Job<AnaliseJobPayload>) => {
      await runEditalAnalysis(job.data.tenderId, { companyId: job.data.companyId, userId: job.data.userId })
    },
    {
      connection: redisConnection,
      // Cada análise carrega vários PDFs em memória, mas com a revisão em dupla uma análise
      // passa minutos esperando a Claude: com uma só vaga, as demais ficariam na fila sem
      // necessidade. Padrão 2; ANALISE_CONCURRENCY ajusta (1 a 4).
      concurrency: concorrenciaDaAnalise(),
      stalledInterval: 300_000,
      lockDuration: 900_000, // 15min — cobre um edital grande inteiro
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Análise Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
