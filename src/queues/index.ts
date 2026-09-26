// ============================================================
// queues/index.ts — Configuração BullMQ + Redis
// ============================================================

import { Queue, QueueOptions } from 'bullmq'
import IORedis from 'ioredis'
import { FonteEnum } from '../types'

// Conexão Redis compartilhada
export const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Obrigatório para BullMQ
})

const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000, // 5s → 10s → 20s
    },
    removeOnComplete: { count: 100 }, // Mantém últimos 100 jobs concluídos
    removeOnFail: { count: 200 },     // Mantém últimos 200 com falha para debug
  },
}

// Filas de coleta — uma por fonte, para que cada worker consuma só a sua
// (numa fila única compartilhada, o BullMQ distribui os jobs entre workers
// concorrentes sem olhar o payload, então o job do PNCP podia ser pego pelo
// worker do ComprasNet e vice-versa, retornando sem coletar nada)
export const coletorPNCPQueue = new Queue('coletor-pncp', defaultQueueOptions)
export const coletorComprasnetQueue = new Queue('coletor-comprasnet', defaultQueueOptions)

// Fila de matching (disparada após salvar cada licitação nova)
export const matcherQueue = new Queue('matcher', defaultQueueOptions)

// Fila de notificações
export const notificadorQueue = new Queue('notificador', defaultQueueOptions)

// Fila de análise de edital por IA — a análise leva minutos e não pode
// rodar dentro da requisição HTTP (ver routes/tenders.ts).
export const analiseQueue = new Queue('analise', defaultQueueOptions)

interface ColetorScheduler {
  queue: Queue
  schedulerId: string
  jobName: string
  pattern: string
  fonte: FonteEnum
}

// A janela de datas NÃO entra no payload: o BullMQ reaproveita o mesmo
// payload em toda repetição do agendador, então qualquer data gravada aqui
// ficaria congelada no dia em que o processo subiu e a coleta pararia de
// avançar silenciosamente. Quem resolve a janela é o worker, no momento da
// execução (ver lib/coletaWindow.ts).
//
// Cadência de 12h (era 2h): a coleta de 2 em 2 horas gastava 12× mais
// comandos no Redis sem trazer licitação nova na mesma proporção, e a cota
// do plano gratuito do Upstash já estourou uma vez neste projeto (ver o
// try/catch de startup em workers/index.ts). As fontes ficam escalonadas em
// uma hora para não competirem entre si pelo rate limit das APIs de origem.
export const COLETOR_SCHEDULERS: ColetorScheduler[] = [
  {
    queue: coletorPNCPQueue,
    schedulerId: 'coleta-pncp',
    jobName: 'coleta-pncp',
    pattern: '0 6,18 * * *',
    fonte: 'PNCP',
  },
  {
    queue: coletorComprasnetQueue,
    schedulerId: 'coleta-comprasnet',
    jobName: 'coleta-comprasnet',
    pattern: '0 7,19 * * *',
    fonte: 'COMPRASNET',
  },
]

// Os agendamentos criados pela API antiga (queue.add com { repeat }) sobrevivem
// no Redis a um redeploy e continuam disparando com o payload congelado que
// tinham — corrigir o código não basta, o agendador velho precisa sair.
async function removerAgendadoresLegados(scheduler: ColetorScheduler): Promise<number> {
  const existentes = await scheduler.queue.getRepeatableJobs()
  let removidos = 0

  for (const repetivel of existentes) {
    if (repetivel.key === scheduler.schedulerId) continue
    await scheduler.queue.removeRepeatableByKey(repetivel.key)
    removidos++
  }

  return removidos
}

export async function scheduleColetorJobs() {
  for (const scheduler of COLETOR_SCHEDULERS) {
    const removidos = await removerAgendadoresLegados(scheduler)
    if (removidos > 0) {
      console.log(`[Queue] ${removidos} agendador(es) legado(s) removido(s) de ${scheduler.queue.name}.`)
    }

    await scheduler.queue.upsertJobScheduler(
      scheduler.schedulerId,
      { pattern: scheduler.pattern },
      { name: scheduler.jobName, data: { fonte: scheduler.fonte } }
    )
  }

  console.log('[Queue] Jobs de coleta agendados.')
}

// Coleta imediata ao subir o processo, sem janela definida — o worker
// resolve o período a partir do relógio e do que já foi coletado.
export async function dispararColetaInicial() {
  for (const scheduler of COLETOR_SCHEDULERS) {
    await scheduler.queue.add(`${scheduler.jobName}-inicial`, { fonte: scheduler.fonte })
  }
}
