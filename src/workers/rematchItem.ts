import { Worker, Job } from 'bullmq'
import { redisConnection } from '../queues'
import { executarBuscaDoItem } from '../services/rematchService'
import { RematchItemJobPayload } from '../types'

export const CONCORRENCIA_DA_BUSCA_DO_ITEM = 1

export async function processarBuscaDoItem(job: Pick<Job<RematchItemJobPayload>, 'data' | 'attemptsMade' | 'opts'>) {
  const ultimaTentativa = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
  const resultado = await executarBuscaDoItem(job.data.itemId, job.data.modo, { ultimaTentativa })
  if (resultado) {
    console.log(`[Busca do item] ${job.data.itemId} (${job.data.modo}) → ${resultado.matchesFound} novo(s) match(es)${resultado.limitado ? ' — no limite por item' : ''}.`)
  }
}

export function startRematchItemWorker() {
  const worker = new Worker<RematchItemJobPayload>('rematch-item', (job) => processarBuscaDoItem(job), {
    connection: redisConnection,
    concurrency: CONCORRENCIA_DA_BUSCA_DO_ITEM,
    stalledInterval: 300_000,
    lockDuration: 300_000,
  })

  worker.on('failed', (job, err) => {
    console.error(`[Busca do item] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
