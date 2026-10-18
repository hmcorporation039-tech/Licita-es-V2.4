// ============================================================
// workers/matcher.ts — Agente Matcher
// Consome a fila 'matcher': cruza a licitação recém-salva com
// os itens monitorados ativos e grava os matches novos.
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../queues'
import { prisma, garantirItensPNCP } from '../services/tenderService'
import { findMatchCandidates } from '../services/matcherService'
import { enfileirarAvisosDeMatch, gravarMatchesDaLicitacao } from '../services/rematchService'
import { MatcherJobPayload } from '../types'

export async function processarLicitacaoNoMatcher(tenderId: string): Promise<string[]> {
  const candidates = await findMatchCandidates(tenderId)
  if (candidates.length === 0) return []

  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { id: true, fonte: true, rawJson: true, encerramentoAt: true },
  })
  if (!tender) return []
  try {
    await garantirItensPNCP(tender)
  } catch (err) {
    console.error('[Matcher Worker] Falha ao buscar itens:', err instanceof Error ? err.message : err)
  }

  const monitoredItemIds = candidates.map((c) => c.monitoredItemId)
  const existing = await prisma.tenderMatch.findMany({
    where: { tenderId, monitoredItemId: { in: monitoredItemIds } },
    select: { monitoredItemId: true },
  })
  const existingSet = new Set(existing.map((e) => e.monitoredItemId))
  const gravados = await gravarMatchesDaLicitacao(tenderId, tender.encerramentoAt, candidates.filter((c) => !existingSet.has(c.monitoredItemId)))
  if (gravados.length === 0) return []

  const created = await prisma.tenderMatch.findMany({
    where: { tenderId, monitoredItemId: { in: gravados } },
    select: { id: true },
  })
  await enfileirarAvisosDeMatch(created.map((m) => m.id), 'Matcher Worker')

  console.log(`[Matcher Worker] Tender ${tenderId} → ${created.length} novo(s) match(es).`)
  return created.map((m) => m.id)
}

export function startMatcherWorker() {
  const worker = new Worker<MatcherJobPayload>(
    'matcher',
    async (job: Job<MatcherJobPayload>) => {
      await processarLicitacaoNoMatcher(job.data.tenderId)
    },
    {
      connection: redisConnection,
      concurrency: 5,
      // Ver comentário equivalente em coletorPNCP.ts — reduz o gasto de
      // requisições do Redis (limite do plano gratuito do Upstash).
      stalledInterval: 300_000, // 5min
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Matcher Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
