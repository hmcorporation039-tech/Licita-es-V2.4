// ============================================================
// services/aiUsageService.ts — Medição de consumo de IA por empresa.
// Tokens são a medida confiável; o custo em USD é uma ESTIMATIVA e só aparece
// se os preços por milhão de tokens estiverem configurados:
//   AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK  (em USD)
// ============================================================

import { prisma } from './tenderService'
import type { UsoDeIa } from './llm/types'

export function estimarCustoUsd(
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const pIn = Number(env.AI_PRICE_INPUT_PER_MTOK)
  const pOut = Number(env.AI_PRICE_OUTPUT_PER_MTOK)
  if (!Number.isFinite(pIn) || !Number.isFinite(pOut) || !env.AI_PRICE_INPUT_PER_MTOK || !env.AI_PRICE_OUTPUT_PER_MTOK) {
    return null
  }
  const custo = (inputTokens / 1_000_000) * pIn + (outputTokens / 1_000_000) * pOut
  return Math.round(custo * 1_000_000) / 1_000_000
}

export interface QuemPediu {
  companyId?: string | null
  userId?: string | null
}

export async function registrarUsoDeIa(args: {
  tenderId: string
  quem?: QuemPediu
  uso: UsoDeIa
  durationMs: number
  status: 'OK' | 'ERRO'
}): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        tenderId: args.tenderId,
        companyId: args.quem?.companyId ?? null,
        userId: args.quem?.userId ?? null,
        provider: args.uso.provider,
        model: args.uso.model,
        inputTokens: args.uso.inputTokens,
        outputTokens: args.uso.outputTokens,
        costUsd: estimarCustoUsd(args.uso.inputTokens, args.uso.outputTokens),
        durationMs: args.durationMs,
        status: args.status,
      },
    })
  } catch (err) {
    // Medir nunca pode derrubar a análise que já foi paga.
    console.error('[Uso de IA] Falha ao registrar o consumo:', err instanceof Error ? err.message : err)
  }
}
