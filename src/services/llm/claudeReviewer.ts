// ============================================================
// services/llm/claudeReviewer.ts — Revisor da análise de edital (Claude).
// Recebe o mesmo edital que o analista leu, mais a análise dele, e devolve a
// versão final conferida. Ver revisao.ts para o contrato e o prompt.
//
// Modelo: claude-opus-5-5 (override por CLAUDE_REVIEW_MODEL). Raciocínio
// adaptativo (o Opus 5.5 não aceita desligá-lo) e esforço "high" definido de
// propósito: o padrão desse modelo é "medium", pouco para conferir um edital
// inteiro. Streaming porque o edital é grande e a resposta pode ser longa.
// ============================================================

import { blocosDeDocumento, getClient } from './claudeAnalyzer'
import {
  EditalReviewer,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
  ReviewOutcome,
  buildInstrucaoRevisao,
  validarRevisao,
} from './revisao'
import { AnalysisRefusedError, ErroComUso, UsoDeIa } from './types'

export const MODELO_REVISOR_PADRAO = 'claude-opus-5-5'

// O revisor devolve a análise INTEIRA (inclusive a matriz de até 150 linhas) mais o
// relatório; os tokens de raciocínio contam no mesmo teto.
const MAX_TOKENS = 64_000

export function modeloDoRevisor(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_REVIEW_MODEL || MODELO_REVISOR_PADRAO
}

export const reviewEdital: EditalReviewer = async (objeto, documentos, rascunho): Promise<ReviewOutcome> => {
  const model = modeloDoRevisor()

  const message = await getClient()
    .messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: REVIEW_SYSTEM_PROMPT,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: REVIEW_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [...blocosDeDocumento(documentos), { type: 'text', text: buildInstrucaoRevisao(objeto, documentos, rascunho) }],
        },
      ],
    })
    .finalMessage()

  // Tokens de cache contam como entrada para fins de custo.
  const u = message.usage
  const uso: UsoDeIa = {
    provider: 'claude',
    model,
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
  }

  try {
    if (message.stop_reason === 'refusal') throw new AnalysisRefusedError()
    if (message.stop_reason === 'max_tokens') {
      throw new Error('A resposta do revisor foi cortada antes de terminar.')
    }
    const bloco = message.content.find((b) => b.type === 'text')
    if (!bloco || bloco.type !== 'text') throw new Error('Resposta do revisor não contém o resultado esperado')

    const { resultado, relatorio } = validarRevisao(JSON.parse(bloco.text))
    return { resultado, relatorio, uso }
  } catch (err) {
    throw new ErroComUso(err, uso)
  }
}
