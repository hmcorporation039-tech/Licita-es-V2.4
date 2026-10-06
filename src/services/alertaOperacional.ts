// ============================================================
// services/alertaOperacional.ts — Avisa o administrador quando algo quebra em
// produção (erro 500 na API, job de worker que falhou, promessa rejeitada sem
// tratamento). Sem isto, o erro só existia no log do Railway e ninguém via.
//
//   ALERT_WEBHOOK_URL  Slack, Discord, Teams ou Google Chat (recebem JSON com
//                      "text"/"content"). Opcional.
//   ALERT_EMAIL        e-mail que recebe o alerta (via Resend). Opcional.
//
// Nunca lança erro (alertar não pode derrubar quem alertou), não repete o mesmo
// alerta mais de uma vez a cada 15 min e remove segredos do texto.
// ============================================================

import axios from 'axios'
import { Resend } from 'resend'
import { exigirEnvioOk } from '../lib/resendResultado'

const SILENCIO_MS = 15 * 60 * 1000
const MAX_DETALHE = 1500
const ultimos = new Map<string, number>()

// Chaves de API, JWT, senhas em URL de banco e cabeçalhos Bearer saem do texto.
export function semSegredos(texto: string): string {
  return texto
    .replace(/(postgres(?:ql)?|redis(?:s)?):\/\/[^\s@]*@/gi, '$1://***@')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***jwt***')
    .replace(/\b(sk-ant-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1***')
    .replace(/\b(AIza[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1***')
    .replace(/\b(re_[A-Za-z0-9]{4})[A-Za-z0-9_]+/g, '$1***')
}

export function deveAlertar(chave: string, agora: number = Date.now()): boolean {
  const ultimo = ultimos.get(chave)
  if (ultimo !== undefined && agora - ultimo < SILENCIO_MS) return false
  ultimos.set(chave, agora)
  if (ultimos.size > 500) ultimos.delete(ultimos.keys().next().value as string)
  return true
}

export function limparSilencio(): void {
  ultimos.clear()
}

function textoDoErro(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}\n${(err.stack ?? '').split('\n').slice(1, 6).join('\n')}`
  return String(err)
}

export interface Envios {
  webhook?: (url: string, corpo: unknown) => Promise<void>
  email?: (para: string, assunto: string, texto: string) => Promise<void>
}

const enviosPadrao: Required<Envios> = {
  webhook: async (url, corpo) => {
    await axios.post(url, corpo, { timeout: 5000 })
  },
  email: async (para, assunto, texto) => {
    if (!process.env.RESEND_API_KEY) return
    const from = process.env.EMAIL_FROM ?? 'noreply@seudominio.com.br'
    exigirEnvioOk(await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: para, subject: assunto, text: texto }))
  },
}

// `origem` + `chave` identificam o alerta para o silêncio (ex.: 'api', 'POST /api/x').
export async function alertarFalha(
  origem: string,
  chave: string,
  err: unknown,
  env: NodeJS.ProcessEnv = process.env,
  envios: Envios = {}
): Promise<boolean> {
  const ambiente = env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? 'desconhecido'
  const titulo = `⚠ Licitações [${ambiente}] — falha em ${origem}: ${chave}`.slice(0, 200)
  const detalhe = semSegredos(textoDoErro(err)).slice(0, MAX_DETALHE)
  return enviarAoAdministrador(`${origem}|${chave}`, titulo, `${detalhe}\n\n(Alertas iguais ficam em silêncio por 15 min.)`, env, envios)
}

// Aviso que não é falha, mas pede ação do administrador (ex.: pedido de exclusão de conta).
export async function avisarAdministrador(
  chave: string,
  assunto: string,
  texto: string,
  env: NodeJS.ProcessEnv = process.env,
  envios: Envios = {}
): Promise<boolean> {
  const ambiente = env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? 'desconhecido'
  return enviarAoAdministrador(`aviso|${chave}`, `Licitações [${ambiente}] — ${assunto}`.slice(0, 200), texto, env, envios)
}

async function enviarAoAdministrador(
  chaveDoSilencio: string,
  titulo: string,
  corpo: string,
  env: NodeJS.ProcessEnv,
  envios: Envios
): Promise<boolean> {
  try {
    const webhook = env.ALERT_WEBHOOK_URL?.trim()
    const email = env.ALERT_EMAIL?.trim()
    if (!webhook && !email) return false
    if (!deveAlertar(chaveDoSilencio)) return false

    const texto = `${titulo}\n${new Date().toISOString()}\n\n${corpo}`
    const enviar = { ...enviosPadrao, ...envios }
    const tarefas: Promise<void>[] = []
    // "text" serve a Slack/Teams/Google Chat; "content" ao Discord (limite 2000).
    if (webhook) tarefas.push(enviar.webhook(webhook, { text: texto, content: texto.slice(0, 1900) }))
    if (email) tarefas.push(enviar.email(email, titulo, texto))
    const resultados = await Promise.allSettled(tarefas)
    for (const r of resultados) {
      if (r.status === 'rejected') console.error('[Alerta] Falha ao enviar alerta:', r.reason instanceof Error ? r.reason.message : r.reason)
    }
    return true
  } catch (e) {
    console.error('[Alerta] Erro inesperado ao alertar:', e instanceof Error ? e.message : e)
    return false
  }
}

// Captura o que escapar de qualquer tratamento no processo (API ou workers).
export function instalarAlertasDoProcesso(origem: string): void {
  process.on('unhandledRejection', (motivo) => {
    console.error(`[${origem}] Promessa rejeitada sem tratamento:`, motivo)
    void alertarFalha(origem, 'unhandledRejection', motivo)
  })
}
