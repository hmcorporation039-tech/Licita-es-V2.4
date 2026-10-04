// ============================================================
// services/aiUsageService.ts — Medição de consumo de IA por empresa.
// Tokens são a medida confiável; o custo em USD é uma ESTIMATIVA e só aparece
// se os preços por milhão de tokens (em USD) estiverem configurados. Com a
// análise em dupla há dois provedores com preços diferentes, então cada um tem
// o seu par de variáveis, com o par genérico como reserva:
//   AI_PRICE_GEMINI_INPUT_PER_MTOK / AI_PRICE_GEMINI_OUTPUT_PER_MTOK
//   AI_PRICE_CLAUDE_INPUT_PER_MTOK / AI_PRICE_CLAUDE_OUTPUT_PER_MTOK
//   AI_PRICE_INPUT_PER_MTOK        / AI_PRICE_OUTPUT_PER_MTOK   (qualquer provedor sem par próprio)
// ============================================================

import { prisma } from './tenderService'
import type { UsoDeIa } from './llm/types'

function preco(env: NodeJS.ProcessEnv, nome: string): number | null {
  const bruto = env[nome]
  if (bruto === undefined || bruto.trim() === '') return null
  const n = Number(bruto)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function estimarCustoUsd(
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env,
  provider?: string
): number | null {
  const sufixo = provider ? provider.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  const pIn = (sufixo ? preco(env, `AI_PRICE_${sufixo}_INPUT_PER_MTOK`) : null) ?? preco(env, 'AI_PRICE_INPUT_PER_MTOK')
  const pOut = (sufixo ? preco(env, `AI_PRICE_${sufixo}_OUTPUT_PER_MTOK`) : null) ?? preco(env, 'AI_PRICE_OUTPUT_PER_MTOK')
  if (pIn === null || pOut === null) return null
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
  // 'analise' (analista) ou 'revisao' (revisor). A cota do cliente conta só 'analise'.
  etapa?: 'analise' | 'revisao'
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
        costUsd: estimarCustoUsd(args.uso.inputTokens, args.uso.outputTokens, process.env, args.uso.provider),
        durationMs: args.durationMs,
        status: args.status,
        etapa: args.etapa ?? 'analise',
      },
    })
  } catch (err) {
    // Medir nunca pode derrubar a análise que já foi paga.
    console.error('[Uso de IA] Falha ao registrar o consumo:', err instanceof Error ? err.message : err)
  }
}
