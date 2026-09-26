// ============================================================
// queues/enfileirar.ts — Enfileira sem travar quando o Redis está fora.
//
// O BullMQ exige maxRetriesPerRequest: null na conexão, e com isso o ioredis
// guarda os comandos numa fila offline e espera reconectar — indefinidamente.
// Ou seja: com o Redis indisponível, `queue.add()` não rejeita, ele PENDURA.
// Os try/catch espalhados pelo código nunca disparavam, e a requisição HTTP
// ficava presa até o cliente desistir (foi assim que dois testes E2E caíram
// com timeout de 30s).
//
// Isto não é hipótese: a cota do plano gratuito do Upstash já estourou neste
// projeto antes (ver comentários em workers/index.ts).
// ============================================================

import { Queue } from 'bullmq'

export const TIMEOUT_ENFILEIRAR_MS = Number(process.env.QUEUE_ENQUEUE_TIMEOUT_MS ?? 5_000)

class EnfileiramentoExpirado extends Error {
  constructor(fila: string, ms: number) {
    super(`Redis não respondeu em ${ms}ms ao enfileirar em "${fila}"`)
  }
}

// Enfileira o job, mas desiste depois de TIMEOUT_ENFILEIRAR_MS. Devolve se
// conseguiu, em vez de lançar: enfileirar é sempre efeito colateral aqui — o
// dado principal já foi salvo e a resposta não pode depender disso.
export async function enfileirarSemTravar<T extends object>(
  queue: Queue,
  nome: string,
  dados: T,
  contexto: string
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined

  try {
    await Promise.race([
      queue.add(nome, dados),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new EnfileiramentoExpirado(queue.name, TIMEOUT_ENFILEIRAR_MS)),
          TIMEOUT_ENFILEIRAR_MS
        )
      }),
    ])
    return true
  } catch (err) {
    console.error(`[${contexto}] Não foi possível enfileirar (o dado principal foi salvo):`, err instanceof Error ? err.message : err)
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
