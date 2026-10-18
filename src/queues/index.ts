// ============================================================
// queues/index.ts — Configuração BullMQ + Redis
// ============================================================

import { Queue, QueueOptions } from 'bullmq'
import IORedis from 'ioredis'
import { ColetorJobPayload, FonteEnum } from '../types'

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
// Etapa 5 — portais sem login/CAPTCHA, fora do PNCP por regime legal próprio
// (ver análise de viabilidade). Sem janela de data: cada coleta traz a
// listagem inteira da fonte, então uma cadência diária já basta.
export const coletorNovacapQueue = new Queue('coletor-novacap', defaultQueueOptions)
export const coletorFiegQueue = new Queue('coletor-fieg', defaultQueueOptions)
export const coletorSescGoQueue = new Queue('coletor-sesc-go', defaultQueueOptions)
export const coletorSestSenatQueue = new Queue('coletor-sest-senat', defaultQueueOptions)
export const coletorSescRegionalQueue = new Queue('coletor-sesc-regional', defaultQueueOptions)
export const coletorQueridoDiarioQueue = new Queue('coletor-querido-diario', defaultQueueOptions)
export const coletorSistemaSQueue = new Queue('coletor-sistema-s', defaultQueueOptions)
export const coletorInfraeroQueue = new Queue('coletor-infraero', defaultQueueOptions)
export const coletorDiarioMunicipalQueue = new Queue('coletor-diario-municipal', defaultQueueOptions)
export const coletorTceCeQueue = new Queue('coletor-tce-ce', defaultQueueOptions)

// Fila de matching (disparada após salvar cada licitação nova)
export const matcherQueue = new Queue('matcher', defaultQueueOptions)

// Fila de notificações
export const notificadorQueue = new Queue('notificador', defaultQueueOptions)

// Fila de análise de edital por IA — a análise leva minutos e não pode
// rodar dentro da requisição HTTP (ver routes/tenders.ts).
export const analiseQueue = new Queue('analise', {
  ...defaultQueueOptions,
  defaultJobOptions: { ...defaultQueueOptions.defaultJobOptions, attempts: 1 },
})

interface ColetorScheduler {
  queue: Queue
  schedulerId: string
  jobName: string
  pattern: string
  // Fuso em que o cron é lido. Sem ele vale o fuso do processo (UTC no Railway),
  // então '0 6 * * *' dispararia às 03:00 de Brasília.
  tz?: string
  fonte: FonteEnum
  dados?: Omit<ColetorJobPayload, 'fonte'>
  disparaNaPartida?: boolean
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
    queue: coletorPNCPQueue,
    schedulerId: 'varredura-propostas-pncp',
    jobName: 'varredura-propostas-pncp',
    pattern: '30 0 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'PNCP',
    dados: { varredura: 'propostas' },
    disparaNaPartida: false,
  },
  // Uma vez por dia — essas 3 não têm filtro de data, então rodar 2x/dia
  // como PNCP/ComprasNet só dobraria o custo sem trazer nada a mais.
  {
    queue: coletorNovacapQueue,
    schedulerId: 'coleta-novacap',
    jobName: 'coleta-novacap',
    pattern: '0 8 * * *',
    fonte: 'NOVACAP',
  },
  {
    queue: coletorFiegQueue,
    schedulerId: 'coleta-fieg',
    jobName: 'coleta-fieg',
    pattern: '0 9 * * *',
    fonte: 'FIEG',
  },
  {
    queue: coletorSescGoQueue,
    schedulerId: 'coleta-sesc-go',
    jobName: 'coleta-sesc-go',
    pattern: '0 10 * * *',
    fonte: 'SESC_GO',
  },
  {
    queue: coletorSestSenatQueue,
    schedulerId: 'coleta-sest-senat',
    jobName: 'coleta-sest-senat',
    pattern: '0 11 * * *',
    fonte: 'SEST_SENAT',
  },
  {
    queue: coletorSescRegionalQueue,
    schedulerId: 'coleta-sesc-regional',
    jobName: 'coleta-sesc-regional',
    // Todo dia às 06:00 de Brasília (não em UTC — ver tz).
    pattern: '0 6 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'SESC_REGIONAL',
  },
  {
    queue: coletorQueridoDiarioQueue,
    schedulerId: 'coleta-querido-diario',
    jobName: 'coleta-querido-diario',
    pattern: '15 2,8,14,20 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'QUERIDO_DIARIO',
  },
  {
    queue: coletorSistemaSQueue,
    schedulerId: 'coleta-sistema-s',
    jobName: 'coleta-sistema-s',
    pattern: '40 1,7,13,19 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'SISTEMA_S',
  },
  {
    queue: coletorInfraeroQueue,
    schedulerId: 'coleta-infraero',
    jobName: 'coleta-infraero',
    pattern: '50 9,16 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'INFRAERO',
  },
  {
    queue: coletorDiarioMunicipalQueue,
    schedulerId: 'coleta-diario-municipal',
    jobName: 'coleta-diario-municipal',
    pattern: '35 5,17 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'DIARIO_MUNICIPAL',
  },
  {
    queue: coletorTceCeQueue,
    schedulerId: 'coleta-tce-ce',
    jobName: 'coleta-tce-ce',
    pattern: '30 10,17 * * *',
    tz: 'America/Sao_Paulo',
    fonte: 'TCE_CE',
  },
]

// Os agendamentos criados pela API antiga (queue.add com { repeat }) sobrevivem
// no Redis a um redeploy e continuam disparando com o payload congelado que
// tinham — corrigir o código não basta, o agendador velho precisa sair.
async function removerAgendadoresLegados(scheduler: ColetorScheduler): Promise<number> {
  const existentes = await scheduler.queue.getRepeatableJobs()
  const atuaisDaFila = COLETOR_SCHEDULERS.filter((s) => s.queue === scheduler.queue).map((s) => s.schedulerId)
  let removidos = 0

  for (const repetivel of existentes) {
    if (atuaisDaFila.includes(repetivel.key)) continue
    await scheduler.queue.removeRepeatableByKey(repetivel.key)
    removidos++
  }

  return removidos
}

export const AGENDADORES_DESATIVADOS: { queue: Queue; schedulerId: string }[] = [{ queue: coletorComprasnetQueue, schedulerId: 'coleta-comprasnet' }]

export async function scheduleColetorJobs() {
  for (const { queue, schedulerId } of AGENDADORES_DESATIVADOS) {
    if (await queue.removeJobScheduler(schedulerId)) console.log(`[Queue] Agendador desativado removido: ${schedulerId}.`)
  }

  for (const scheduler of COLETOR_SCHEDULERS) {
    const removidos = await removerAgendadoresLegados(scheduler)
    if (removidos > 0) {
      console.log(`[Queue] ${removidos} agendador(es) legado(s) removido(s) de ${scheduler.queue.name}.`)
    }

    await scheduler.queue.upsertJobScheduler(
      scheduler.schedulerId,
      { pattern: scheduler.pattern, ...(scheduler.tz ? { tz: scheduler.tz } : {}) },
      { name: scheduler.jobName, data: { ...scheduler.dados, fonte: scheduler.fonte } }
    )
  }

  console.log('[Queue] Jobs de coleta agendados.')
}

// Coleta imediata ao subir o processo, sem janela definida — o worker
// resolve o período a partir do relógio e do que já foi coletado.
export async function dispararColetaInicial() {
  for (const scheduler of COLETOR_SCHEDULERS) {
    if (scheduler.disparaNaPartida === false) continue
    await scheduler.queue.add(`${scheduler.jobName}-inicial`, { fonte: scheduler.fonte })
  }
}
