import { sendNotification, WebPushError } from 'web-push'
import { prisma } from './tenderService'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa } from './avisoDeAcessoEncerrado'
import { whereDaLicitacaoNoFeed } from '../lib/feedDeMatches'
import { mensagemDeNovasLicitacoes, type LicitacaoDoAvisoNoCelular, type MensagemNoCelular } from '../lib/notificacaoNoCelular'

const HORA_MS = 60 * 60 * 1000
const TEMPO_DE_VIDA_DO_AVISO_S = 12 * 60 * 60
const TEMPO_LIMITE_DA_ENTREGA_MS = 10_000
export const LIMITE_DE_FALHAS_SEGUIDAS = 5

export const PREFIXO_DAS_NOVAS_LICITACOES = 'celular-novas'
export const ESPERA_PARA_AGRUPAR_MS = 3 * 60 * 1000
export const JANELA_MAXIMA_DAS_NOVAS_MS = 6 * HORA_MS
export const IDADE_MAXIMA_DA_LICITACAO_NOVA_MS = 48 * HORA_MS
const MAXIMO_DE_LICITACOES_GUARDADAS = 50

export interface ResultadoDaEntrega {
  aparelhos: number
  entregues: number
  removidos: number
}

export type ResultadoDasNovasNoCelular = 'enviado' | 'sem-novidade' | 'desligado' | 'nao-entregue'

interface ChavesDoCelular {
  publica: string
  privada: string
  contato: string
}

function chavesDoCelular(): ChavesDoCelular | null {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim()
  const privada = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publica || !privada) return null
  return { publica, privada, contato: process.env.VAPID_SUBJECT?.trim() || 'mailto:suporte@licitabela.com.br' }
}

export function celularConfigurado(): boolean {
  return chavesDoCelular() !== null
}

export function chavePublicaDoCelular(): string | null {
  return chavesDoCelular()?.publica ?? null
}

export async function temAparelhoNoCelular(userId: string): Promise<boolean> {
  return (await prisma.pushSubscription.count({ where: { userId } })) > 0
}

function aparelhoSaiuDoAr(err: unknown): boolean {
  return err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)
}

function motivoDaFalha(err: unknown): string {
  if (err instanceof WebPushError) return `HTTP ${err.statusCode}`
  return err instanceof Error ? err.message : String(err)
}

async function registrarFalha(inscricao: { id: string; falhasSeguidas: number }, err: unknown): Promise<boolean> {
  const remover = aparelhoSaiuDoAr(err) || inscricao.falhasSeguidas + 1 >= LIMITE_DE_FALHAS_SEGUIDAS
  if (remover) await prisma.pushSubscription.deleteMany({ where: { id: inscricao.id } })
  else await prisma.pushSubscription.updateMany({ where: { id: inscricao.id }, data: { falhasSeguidas: { increment: 1 } } })
  return remover
}

export async function enviarNoCelular(userId: string, mensagem: MensagemNoCelular, opcoes: { urgente?: boolean; agora?: Date } = {}): Promise<ResultadoDaEntrega> {
  const resultado: ResultadoDaEntrega = { aparelhos: 0, entregues: 0, removidos: 0 }
  const chaves = chavesDoCelular()
  if (!chaves) return resultado
  const agora = opcoes.agora ?? new Date()
  try {
    const inscricoes = await prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, falhasSeguidas: true } })
    resultado.aparelhos = inscricoes.length
    const corpo = JSON.stringify({ titulo: mensagem.titulo, corpo: mensagem.corpo, url: mensagem.url, tag: mensagem.tag })
    for (const inscricao of inscricoes) {
      try {
        await sendNotification({ endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } }, corpo, {
          TTL: TEMPO_DE_VIDA_DO_AVISO_S,
          urgency: opcoes.urgente ? 'high' : 'normal',
          timeout: TEMPO_LIMITE_DA_ENTREGA_MS,
          vapidDetails: { subject: chaves.contato, publicKey: chaves.publica, privateKey: chaves.privada },
        })
        resultado.entregues++
        await prisma.pushSubscription.updateMany({ where: { id: inscricao.id }, data: { ultimoEnvioEm: agora, falhasSeguidas: 0 } })
      } catch (err) {
        if (!aparelhoSaiuDoAr(err)) console.error(`[Celular] Falha ao entregar para o usuário ${userId}:`, motivoDaFalha(err))
        if (await registrarFalha(inscricao, err).catch(() => false)) resultado.removidos++
      }
    }
  } catch (err) {
    console.error(`[Celular] Falha ao avisar o usuário ${userId}:`, motivoDaFalha(err))
  }
  return resultado
}

export function idDoAgrupamentoDeNovas(userId: string): string {
  return `${PREFIXO_DAS_NOVAS_LICITACOES}-${userId}`
}

export async function querNovasLicitacoesNoCelular(userId: string): Promise<boolean> {
  if (!chavesDoCelular()) return false
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { celularNovasLicitacoes: true, _count: { select: { pushSubscriptions: true } } } })
  return Boolean(usuario?.celularNovasLicitacoes && usuario._count.pushSubscriptions > 0)
}

async function inicioDaJanelaDasNovas(userId: string, agora: Date): Promise<Date> {
  const ultimo = await prisma.notification.findFirst({
    where: { userId, id: { startsWith: `${PREFIXO_DAS_NOVAS_LICITACOES}:${userId}:` } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return new Date(Math.max(ultimo?.createdAt.getTime() ?? 0, agora.getTime() - JANELA_MAXIMA_DAS_NOVAS_MS))
}

async function licitacoesNovasDoUsuario(userId: string, desde: Date, agora: Date): Promise<LicitacaoDoAvisoNoCelular[]> {
  const matches = await prisma.tenderMatch.findMany({
    where: {
      userId,
      dentroDeObraCompleta: false,
      createdAt: { gt: desde, lte: agora },
      tender: { AND: [whereDaLicitacaoNoFeed({}, agora), { createdAt: { gte: new Date(agora.getTime() - IDADE_MAXIMA_DA_LICITACAO_NOVA_MS) } }] },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { tender: { select: { id: true, objeto: true, objetoResumido: true, orgao: true, uf: true } } },
  })
  const vistas = new Map<string, LicitacaoDoAvisoNoCelular>()
  for (const { tender } of matches) {
    if (!vistas.has(tender.id)) vistas.set(tender.id, { tenderId: tender.id, objeto: tender.objetoResumido ?? tender.objeto, orgao: tender.orgao, uf: tender.uf })
  }
  return [...vistas.values()]
}

export async function avisarNovasLicitacoesNoCelular(userId: string, agora: Date = new Date()): Promise<ResultadoDasNovasNoCelular> {
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { ...SELECT_DO_DESTINATARIO, celularNovasLicitacoes: true } })
  if (!usuario?.celularNovasLicitacoes || acessoDoDestinatarioComEmpresa(usuario, agora.getTime()).situacao !== 'ativo') return 'desligado'

  const licitacoes = await licitacoesNovasDoUsuario(userId, await inicioDaJanelaDasNovas(userId, agora), agora)
  if (licitacoes.length === 0) return 'sem-novidade'

  const mensagem = mensagemDeNovasLicitacoes(licitacoes)
  const { entregues } = await enviarNoCelular(userId, mensagem, { agora })
  if (entregues === 0) return 'nao-entregue'

  await prisma.notification.create({
    data: {
      id: `${PREFIXO_DAS_NOVAS_LICITACOES}:${userId}:${agora.getTime()}`,
      userId,
      type: 'PUSH',
      title: mensagem.titulo,
      body: mensagem.corpo,
      sentAt: agora,
      createdAt: agora,
      metadata: { celularNovasLicitacoes: licitacoes.length, tenderIds: licitacoes.slice(0, MAXIMO_DE_LICITACOES_GUARDADAS).map((l) => l.tenderId) },
    },
  })
  return 'enviado'
}
