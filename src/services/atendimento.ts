import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { analiseHabilitada } from './editalAnalysisService'
import { registrarUsoDeIa } from './aiUsageService'
import { limitesDaEmpresa, usoDaEmpresa } from './quotaService'
import { abrirChamado, responderChamado } from './chamados'
import { ErroComUso, type UsoDeIa } from './llm/types'
import { PLANO_DE_TESTE } from '../lib/acessoEncerrado'
import type { ErroRecenteDaTela } from '../lib/suporte'
import {
  AVISO_DO_ESPECIALISTA,
  INSTRUCAO_DO_ATENDIMENTO,
  INSTRUCAO_DO_ESPECIALISTA,
  JANELA_PARA_JUNTAR_NO_MESMO_CHAMADO_MS,
  MENSAGENS_NO_HISTORICO,
  RESPOSTA_DO_ATENDIMENTO_SCHEMA,
  RESPOSTA_DO_ESPECIALISTA_SCHEMA,
  artigosDaLei,
  artigosRelacionados,
  conferirCitacoesDaLei,
  decidirChamado,
  indexarLei,
  montarConversa,
  textoDosArtigos,
  textoDosDadosDaConta,
  validarRespostaDoAtendimento,
  validarRespostaDoEspecialista,
  type CitacaoDaLeiConferida,
  type DadosDaConta,
  type IndiceDaLei,
  type Intencao,
  type PapelNaConversa,
  type RespostaDoAtendimento,
  type RespostaDoEspecialista,
} from '../lib/atendimento'

export const TEMPO_MAXIMO_DO_ATENDIMENTO_MS = 45_000
export const DIAS_DE_GUARDA_DA_CONVERSA = 180

const RAIZ = resolve(__dirname, '..', '..')

export type Consultor<T> = (instrucao: string, partes: string[], schema: object) => Promise<{ json: T; uso: UsoDeIa }>

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

export function atendimentoHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  return analiseHabilitada() && !!env.GEMINI_API_KEY?.trim()
}

export function modeloDoAtendimento(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_MODEL_SUPORTE?.trim() || env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
}

export class AtendimentoIndisponivel extends Error {}

export const consultarGemini: Consultor<unknown> = async (instrucao, partes, schema) => {
  const model = modeloDoAtendimento()
  const response = await getClient().models.generateContent({
    model,
    contents: [{ role: 'user', parts: partes.map((text) => ({ text })) }],
    config: {
      systemInstruction: instrucao,
      responseMimeType: 'application/json',
      responseSchema: schema,
      abortSignal: AbortSignal.timeout(TEMPO_MAXIMO_DO_ATENDIMENTO_MS),
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
    if (response.promptFeedback?.blockReason) throw new AtendimentoIndisponivel('A IA não quis responder a esta mensagem.')
    const fim = response.candidates?.[0]?.finishReason
    if (fim && fim !== 'STOP') throw new Error(`Resposta interrompida (${fim})`)
    if (!response.text) throw new Error('Resposta vazia da IA')
    return { json: JSON.parse(response.text), uso }
  } catch (err) {
    throw new ErroComUso(err, uso)
  }
}

let baseDeConhecimento: string | null = null
export function lerBaseDeConhecimento(): string {
  if (baseDeConhecimento === null) {
    try {
      baseDeConhecimento = readFileSync(resolve(RAIZ, 'docs', 'suporte', 'base-conhecimento.md'), 'utf8')
    } catch (err) {
      console.error('[Atendimento] Base de conhecimento não encontrada:', err instanceof Error ? err.message : err)
      baseDeConhecimento = 'A Licita Bela encontra licitações públicas compatíveis com a empresa. Para qualquer dúvida de uso, encaminhe para a equipe.'
    }
  }
  return baseDeConhecimento
}

let indiceDaLei: IndiceDaLei | null | undefined
export function lerIndiceDaLei(): IndiceDaLei | null {
  if (indiceDaLei === undefined) {
    try {
      indiceDaLei = indexarLei(artigosDaLei(readFileSync(resolve(RAIZ, 'docs', 'suporte', 'lei-14133.txt'), 'utf8')))
    } catch (err) {
      console.error('[Atendimento] Texto da Lei 14.133 não encontrado:', err instanceof Error ? err.message : err)
      indiceDaLei = null
    }
  }
  return indiceDaLei
}

export async function dadosDaConta(args: { companyId: string; userId: string; tela: string | null }): Promise<DadosDaConta> {
  const [{ planName, planCode, limites }, uso, usuario, chamados] = await Promise.all([
    limitesDaEmpresa(args.companyId),
    usoDaEmpresa(args.companyId),
    prisma.user.findUniqueOrThrow({ where: { id: args.userId }, select: { companyRole: true, accessExpiresAt: true } }),
    prisma.chamado.findMany({ where: { userId: args.userId, status: { not: 'RESOLVIDO' } }, orderBy: { createdAt: 'desc' }, take: 5, select: { numero: true, assunto: true, status: true } }),
  ])
  return {
    plano: planName,
    emTeste: planCode === PLANO_DE_TESTE,
    acessoAte: usuario.accessExpiresAt,
    papel: usuario.companyRole,
    limites: limites as unknown as Record<string, number | null>,
    uso: uso as unknown as Record<string, number>,
    chamadosAbertos: chamados,
    tela: args.tela,
  }
}

export interface MensagemDaConversa {
  id: string
  papel: PapelNaConversa
  texto: string
  createdAt: Date
  citacoes?: CitacaoDaLeiConferida[]
  semComprovacao?: boolean
  aviso?: string
  chamado?: number | null
}

interface DadosDaMensagem {
  intencao?: Intencao
  citacoes?: CitacaoDaLeiConferida[]
  semComprovacao?: boolean
  aviso?: string
  chamado?: number | null
}

function paraMensagem(m: { id: string; papel: string; texto: string; createdAt: Date; dados: Prisma.JsonValue | null }): MensagemDaConversa {
  const dados = (m.dados ?? {}) as DadosDaMensagem
  return { id: m.id, papel: m.papel as PapelNaConversa, texto: m.texto, createdAt: m.createdAt, citacoes: dados.citacoes, semComprovacao: dados.semComprovacao, aviso: dados.aviso, chamado: dados.chamado ?? null }
}

export async function conversaDoUsuario(userId: string, limite = 40): Promise<MensagemDaConversa[]> {
  const linhas = await prisma.mensagemDeSuporte.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limite, select: { id: true, papel: true, texto: true, createdAt: true, dados: true } })
  return linhas.reverse().map(paraMensagem)
}

export async function mensagensDoUsuarioNaUltimaHora(userId: string, agora: Date = new Date()): Promise<number> {
  return prisma.mensagemDeSuporte.count({ where: { userId, papel: 'USUARIO', createdAt: { gte: new Date(agora.getTime() - 60 * 60 * 1000) } } })
}

async function consultarComRegistro<T>(args: {
  consultor: Consultor<unknown>
  instrucao: string
  partes: string[]
  schema: object
  validar: (json: unknown) => T
  quem: { companyId: string; userId: string }
  etapa: 'suporte' | 'especialista'
}): Promise<T> {
  const inicio = Date.now()
  try {
    const { json, uso } = await args.consultor(args.instrucao, args.partes, args.schema)
    try {
      const valido = args.validar(json)
      await registrarUsoDeIa({ tenderId: null, quem: args.quem, uso, durationMs: Date.now() - inicio, status: 'OK', etapa: args.etapa })
      return valido
    } catch (err) {
      throw new ErroComUso(err, uso)
    }
  } catch (err) {
    const uso = err instanceof ErroComUso ? err.uso : { provider: 'gemini', model: modeloDoAtendimento(), inputTokens: 0, outputTokens: 0 }
    await registrarUsoDeIa({ tenderId: null, quem: args.quem, uso, durationMs: Date.now() - inicio, status: 'ERRO', etapa: args.etapa })
    throw err instanceof ErroComUso ? err.causa : err
  }
}

async function chamadoDoAtendimento(args: {
  companyId: string
  userId: string
  decisao: { tipo: RespostaDoAtendimento['tipoDoChamado'] }
  assunto: string
  mensagem: string
  historico: Array<{ papel: PapelNaConversa; texto: string }>
  tela: string | null
  navegador: string | null
  errosRecentes: ErroRecenteDaTela[]
  agora: Date
}): Promise<{ numero: number; novo: boolean }> {
  const recente = await prisma.chamado.findFirst({
    where: { userId: args.userId, origem: 'ATENDIMENTO', status: { not: 'RESOLVIDO' }, updatedAt: { gte: new Date(args.agora.getTime() - JANELA_PARA_JUNTAR_NO_MESMO_CHAMADO_MS) } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, numero: true },
  })
  if (recente) {
    await responderChamado({ chamadoId: recente.id, autor: 'CLIENTE', userId: args.userId, texto: args.mensagem }, args.agora)
    return { numero: recente.numero, novo: false }
  }
  const anteriores = args.historico.filter((h) => h.papel === 'USUARIO').slice(-2).map((h) => h.texto)
  const relato = [...anteriores, args.mensagem].join('\n\n')
  const chamado = await abrirChamado(
    {
      companyId: args.companyId,
      userId: args.userId,
      tipo: args.decisao.tipo,
      origem: 'ATENDIMENTO',
      assunto: (args.assunto || args.mensagem).slice(0, 120),
      relato: relato.slice(0, 4000),
      tela: args.tela,
      navegador: args.navegador,
      errosRecentes: args.errosRecentes,
    },
    args.agora
  )
  return { numero: chamado.numero, novo: true }
}

export function textoDoAvisoDeChamado(numero: number, novo: boolean): string {
  return novo
    ? `Abri o chamado #${numero} para a equipe. A resposta chega por e-mail e em Suporte, em dias úteis, em até 1 dia útil.`
    : `Juntei esta mensagem ao chamado #${numero}, que a equipe já está acompanhando.`
}

export async function conversarComOSuporte(args: {
  companyId: string
  userId: string
  mensagem: string
  tela: string | null
  navegador: string | null
  errosRecentes: ErroRecenteDaTela[]
  consultor?: Consultor<unknown>
  agora?: Date
}): Promise<{ pergunta: MensagemDaConversa; resposta: MensagemDaConversa }> {
  const agora = args.agora ?? new Date()
  const consultor = args.consultor ?? consultarGemini
  const quem = { companyId: args.companyId, userId: args.userId }
  const anteriores = await conversaDoUsuario(args.userId, MENSAGENS_NO_HISTORICO)
  const historico = anteriores.map((m) => ({ papel: m.papel, texto: m.texto }))
  const conversa = montarConversa(historico, args.mensagem)
  const conta = await dadosDaConta({ companyId: args.companyId, userId: args.userId, tela: args.tela })

  const atendimento = await consultarComRegistro({
    consultor,
    instrucao: INSTRUCAO_DO_ATENDIMENTO,
    partes: [`BASE DE CONHECIMENTO\n${lerBaseDeConhecimento()}`, `DADOS DA CONTA\n${textoDosDadosDaConta(conta)}`, `CONVERSA\n${conversa}`],
    schema: RESPOSTA_DO_ATENDIMENTO_SCHEMA,
    validar: validarRespostaDoAtendimento,
    quem,
    etapa: 'suporte',
  })

  let papel: PapelNaConversa = 'ATENDIMENTO'
  let texto = atendimento.resposta
  const dados: DadosDaMensagem = { intencao: atendimento.intencao }

  const lei = atendimento.intencao === 'LICITACAO' ? lerIndiceDaLei() : null
  if (lei) {
    const artigos = artigosRelacionados(`${historico.filter((h) => h.papel === 'USUARIO').slice(-1).map((h) => h.texto).join(' ')} ${args.mensagem}`, lei)
    const especialista: RespostaDoEspecialista = await consultarComRegistro({
      consultor,
      instrucao: INSTRUCAO_DO_ESPECIALISTA,
      partes: [`ARTIGOS DA LEI 14.133\n${artigos.length > 0 ? textoDosArtigos(artigos) : '(nenhum artigo ligado à pergunta foi encontrado)'}`, `CONVERSA\n${conversa}`],
      schema: RESPOSTA_DO_ESPECIALISTA_SCHEMA,
      validar: validarRespostaDoEspecialista,
      quem,
      etapa: 'especialista',
    })
    const conferidas = conferirCitacoesDaLei(especialista, artigos)
    papel = 'ESPECIALISTA'
    texto = especialista.resposta
    dados.citacoes = conferidas.citacoes
    dados.semComprovacao = conferidas.semComprovacao
    dados.aviso = AVISO_DO_ESPECIALISTA
  }

  const decisao = decidirChamado(atendimento)
  if (decisao.abrir) {
    const chamado = await chamadoDoAtendimento({
      companyId: args.companyId,
      userId: args.userId,
      decisao,
      assunto: atendimento.assuntoDoChamado,
      mensagem: args.mensagem,
      historico,
      tela: args.tela,
      navegador: args.navegador,
      errosRecentes: args.errosRecentes,
      agora,
    })
    dados.chamado = chamado.numero
    texto = `${texto}\n\n${textoDoAvisoDeChamado(chamado.numero, chamado.novo)}`
  }

  const [pergunta, resposta] = await prisma.$transaction([
    prisma.mensagemDeSuporte.create({
      data: { companyId: args.companyId, userId: args.userId, papel: 'USUARIO', texto: args.mensagem, createdAt: agora },
      select: { id: true, papel: true, texto: true, createdAt: true, dados: true },
    }),
    prisma.mensagemDeSuporte.create({
      data: { companyId: args.companyId, userId: args.userId, papel, texto, dados: dados as unknown as Prisma.InputJsonValue, createdAt: new Date(agora.getTime() + 1) },
      select: { id: true, papel: true, texto: true, createdAt: true, dados: true },
    }),
  ])
  return { pergunta: paraMensagem(pergunta), resposta: paraMensagem(resposta) }
}

export async function apagarConversasAntigas(agora: Date = new Date()): Promise<{ apagadas: number }> {
  const { count } = await prisma.mensagemDeSuporte.deleteMany({ where: { createdAt: { lt: new Date(agora.getTime() - DIAS_DE_GUARDA_DA_CONVERSA * 24 * 60 * 60 * 1000) } } })
  return { apagadas: count }
}
