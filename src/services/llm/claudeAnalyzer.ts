// ============================================================
// services/llm/claudeAnalyzer.ts — Analisa o edital com a API da Claude
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import {
  ANALYSIS_SCHEMA,
  AnalysisRefusedError,
  EditalAnalysisOutcome,
  EditalDocumento,
  SYSTEM_PROMPT,
  buildInstrucao,
  ErroComUso,
  UsoDeIa,
  validarResultadoAnalise,
} from './types'

let anthropicClient: Anthropic | null = null
export function getClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic()
  return anthropicClient
}

// Os tokens de raciocínio contam no mesmo teto da resposta — com 8000, um
// edital denso truncava o JSON no meio e a análise virava erro de parse.
const MAX_TOKENS = 32_000

// Blocos de documento da API (texto puro ou PDF nativo para os escaneados).
// Compartilhado com o revisor, que lê exatamente o mesmo edital.
export function blocosDeDocumento(documentos: EditalDocumento[]): Anthropic.ContentBlockParam[] {
  return documentos.map((doc) =>
    doc.tipo === 'pdf'
      ? {
          type: 'document' as const,
          title: doc.nome,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: doc.data.toString('base64') },
        }
      : {
          type: 'document' as const,
          title: doc.nome,
          source: { type: 'text' as const, media_type: 'text/plain' as const, data: doc.texto },
        }
  )
}

export async function analyzeEdital(
  objeto: string,
  documentos: EditalDocumento[]
): Promise<EditalAnalysisOutcome> {
  const model = process.env.CLAUDE_ANALYSIS_MODEL || 'claude-opus-5'
  const blocosDeDocumentoDaApi = blocosDeDocumento(documentos)

  // Streaming porque um edital de centenas de páginas com effort alto passa
  // do timeout HTTP padrão do SDK numa chamada não-streaming.
  const message = await getClient()
    .messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [...blocosDeDocumentoDaApi, { type: 'text', text: buildInstrucao(objeto, documentos) }],
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
    if (message.stop_reason === 'refusal') {
      throw new AnalysisRefusedError()
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('A resposta do modelo foi cortada antes de terminar — o edital é grande demais para uma análise única.')
    }

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Resposta do modelo não contém o resultado esperado')
    }

    return { resultado: validarResultadoAnalise(JSON.parse(textBlock.text)), uso }
  } catch (err) {
    throw new ErroComUso(err, uso)
  }
}
