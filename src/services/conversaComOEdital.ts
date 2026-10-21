import { GoogleGenAI } from '@google/genai'
import { prisma } from './tenderService'
import { analiseHabilitada } from './editalAnalysisService'
import { registrarUsoDeIa } from './aiUsageService'
import { carregarTextosDoEdital } from './textosDoEdital'
import { ErroComUso, type UsoDeIa } from './llm/types'
import {
  INSTRUCAO_DA_CONVERSA,
  PERGUNTAS_NO_HISTORICO,
  RESPOSTA_SCHEMA,
  conferirResposta,
  montarPergunta,
  textoDosDocumentos,
  validarRespostaDaIa,
  type RespostaDaIa,
  type RespostaRegistrada,
} from '../lib/conversaComOEdital'

export const TEMPO_MAXIMO_DA_RESPOSTA_MS = 60_000

export type Respondedor = (documentos: string, pergunta: string) => Promise<{ resposta: RespostaDaIa; uso: UsoDeIa }>

export class ConversaIndisponivel extends Error {}

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

export function conversaHabilitada(env: NodeJS.ProcessEnv = process.env): boolean {
  return analiseHabilitada() && !!env.GEMINI_API_KEY?.trim()
}

export function modeloDaConversa(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_MODEL_CONVERSA?.trim() || env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
}

export const responderComGemini: Respondedor = async (documentos, pergunta) => {
  const model = modeloDaConversa()
  const response = await getClient().models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: documentos }, { text: pergunta }] }],
    config: {
      systemInstruction: INSTRUCAO_DA_CONVERSA,
      responseMimeType: 'application/json',
      responseSchema: RESPOSTA_SCHEMA,
      abortSignal: AbortSignal.timeout(TEMPO_MAXIMO_DA_RESPOSTA_MS),
    },
  })
  const meta = response.usageMetadata
  const uso: UsoDeIa = {
    provider: 'gemini',
    model,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
  }
  try {
    if (response.promptFeedback?.blockReason) throw new ConversaIndisponivel('A IA não quis responder a esta pergunta.')
    const fim = response.candidates?.[0]?.finishReason
    if (fim && fim !== 'STOP') throw new Error(`Resposta interrompida (${fim})`)
    if (!response.text) throw new Error('Resposta vazia da IA')
    return { resposta: validarRespostaDaIa(JSON.parse(response.text)), uso }
  } catch (err) {
    throw new ErroComUso(err, uso)
  }
}

export interface PerguntaRespondida {
  id: string
  pergunta: string
  resposta: RespostaRegistrada
  createdAt: Date
  autor: string | null
}

export async function perguntasDaEmpresa(tenderId: string, companyId: string, limite = 50): Promise<PerguntaRespondida[]> {
  const linhas = await prisma.editalPergunta.findMany({
    where: { tenderId, companyId },
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: { id: true, pergunta: true, resposta: true, createdAt: true, user: { select: { name: true } } },
  })
  return linhas.reverse().map((l) => ({
    id: l.id,
    pergunta: l.pergunta,
    resposta: l.resposta as unknown as RespostaRegistrada,
    createdAt: l.createdAt,
    autor: l.user?.name ?? null,
  }))
}

export async function perguntasDoUsuarioNaUltimaHora(userId: string, agora: Date = new Date()): Promise<number> {
  return prisma.aiUsage.count({ where: { userId, etapa: 'pergunta', createdAt: { gte: new Date(agora.getTime() - 60 * 60 * 1000) } } })
}

export async function responderPergunta(args: {
  tenderId: string
  companyId: string
  userId: string
  pergunta: string
  responder?: Respondedor
}): Promise<PerguntaRespondida> {
  const documentos = await carregarTextosDoEdital(args.tenderId)
  const texto = textoDosDocumentos(documentos)
  if (!texto) throw new ConversaIndisponivel('Os documentos desta licitação são imagens escaneadas, sem texto para a conversa.')

  const anteriores = await perguntasDaEmpresa(args.tenderId, args.companyId, PERGUNTAS_NO_HISTORICO)
  const historico = anteriores.map((p) => ({ pergunta: p.pergunta, resposta: p.resposta.texto }))
  const responder = args.responder ?? responderComGemini
  const quem = { companyId: args.companyId, userId: args.userId }
  const inicio = Date.now()

  let resultado: Awaited<ReturnType<Respondedor>>
  try {
    resultado = await responder(texto, montarPergunta(args.pergunta, historico))
  } catch (err) {
    const uso = err instanceof ErroComUso ? err.uso : { provider: 'gemini', model: modeloDaConversa(), inputTokens: 0, outputTokens: 0 }
    await registrarUsoDeIa({ tenderId: args.tenderId, quem, uso, durationMs: Date.now() - inicio, status: 'ERRO', etapa: 'pergunta' })
    throw err instanceof ErroComUso ? err.causa : err
  }

  await registrarUsoDeIa({ tenderId: args.tenderId, quem, uso: resultado.uso, durationMs: Date.now() - inicio, status: 'OK', etapa: 'pergunta' })
  const resposta = conferirResposta(resultado.resposta, documentos)
  const salva = await prisma.editalPergunta.create({
    data: { tenderId: args.tenderId, companyId: args.companyId, userId: args.userId, pergunta: args.pergunta, resposta: resposta as unknown as object },
    select: { id: true, createdAt: true, user: { select: { name: true } } },
  })
  return { id: salva.id, pergunta: args.pergunta, resposta, createdAt: salva.createdAt, autor: salva.user?.name ?? null }
}
