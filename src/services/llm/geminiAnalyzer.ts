// ============================================================
// services/llm/geminiAnalyzer.ts — Analisa o edital com a API do
// Google Gemini (alternativa gratuita à Claude — ver AI_PROVIDER no
// .env / editalAnalysisService.ts).
// ============================================================

import { GoogleGenAI } from '@google/genai'
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

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

export async function analyzeEdital(
  objeto: string,
  documentos: EditalDocumento[]
): Promise<EditalAnalysisOutcome> {
  const partes = [
    ...documentos.map((doc) =>
      doc.tipo === 'pdf'
        ? { inlineData: { mimeType: 'application/pdf', data: doc.data.toString('base64') } }
        : { text: `--- ${doc.nome} ---\n\n${doc.texto}` }
    ),
    { text: buildInstrucao(objeto, documentos) },
  ]

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
  const response = await getClient().models.generateContent({
    model,
    contents: [{ role: 'user', parts: partes }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA,
    },
  })

  const meta = response.usageMetadata
  const uso: UsoDeIa = {
    provider: 'gemini',
    model,
    inputTokens: meta?.promptTokenCount ?? 0,
    // Tokens de raciocínio são cobrados como saída.
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
  }

  try {
    if (response.promptFeedback?.blockReason) {
      throw new AnalysisRefusedError()
    }
    const finishReason = response.candidates?.[0]?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      throw new AnalysisRefusedError()
    }

    if (!response.text) {
      throw new Error('Resposta do modelo não contém o resultado esperado')
    }

    return { resultado: validarResultadoAnalise(JSON.parse(response.text)), uso }
  } catch (err) {
    throw new ErroComUso(err, uso)
  }
}
