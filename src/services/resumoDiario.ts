import { prisma } from './tenderService'
import { agruparMatchesDoResumo, sendResumoDiarioEmail, type MatchParaResumo } from './emailService'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa } from './avisoDeAcessoEncerrado'
import { confirmarEnvio, desfazerReservas, reservarNotificacao } from './reservaDeNotificacao'
import { whereDaLicitacaoNoFeed } from '../lib/feedDeMatches'
import { diaDeBrasilia } from '../lib/dataDeBrasilia'
import { quantidadeCom } from '../lib/plural'

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

export const JANELA_DO_PRIMEIRO_RESUMO_MS = DIA_MS
export const RETROSPECTIVA_MAXIMA_MS = 7 * DIA_MS
export const FOLGA_ENTRE_RESUMOS_MS = HORA_MS

const PREFIXO_DO_RESUMO = 'resumo-diario'

export type ResultadoDoResumo = 'enviado' | 'sem-novidade' | 'ja-enviado' | 'sem-acesso' | 'nao-enviado'

export interface ResumosDoDia {
  usuarios: number
  enviados: number
  falhas: number
}

export function idDoResumoDiario(userId: string, dia: string): string {
  return `${PREFIXO_DO_RESUMO}:${userId}:${dia}`
}

function idsDoMetadata(metadata: unknown, campo: 'tenderMatchIds' | 'tenderIds'): string[] {
  if (!metadata || typeof metadata !== 'object') return []
  const valor = (metadata as Record<string, unknown>)[campo]
  return Array.isArray(valor) ? valor.filter((id): id is string => typeof id === 'string') : []
}

async function resumosEnviados(userId: string, agora: Date) {
  const doUsuario = { userId, id: { startsWith: `${PREFIXO_DO_RESUMO}:${userId}:` }, sentAt: { not: null } }
  const [recentes, ultimo] = await Promise.all([
    prisma.notification.findMany({
      where: { ...doUsuario, createdAt: { gte: new Date(agora.getTime() - RETROSPECTIVA_MAXIMA_MS - DIA_MS) } },
      select: { id: true, metadata: true },
    }),
    prisma.notification.findFirst({ where: doUsuario, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])
  return {
    inicioDaJanela: ultimo
      ? new Date(Math.max(ultimo.createdAt.getTime() - FOLGA_ENTRE_RESUMOS_MS, agora.getTime() - RETROSPECTIVA_MAXIMA_MS))
      : new Date(agora.getTime() - JANELA_DO_PRIMEIRO_RESUMO_MS),
    idsJaEnviados: new Set(recentes.map((r) => r.id)),
    matchesJaEnviados: recentes.flatMap((r) => idsDoMetadata(r.metadata, 'tenderMatchIds')),
    licitacoesJaEnviadas: recentes.flatMap((r) => idsDoMetadata(r.metadata, 'tenderIds')),
  }
}

interface MatchesNovosDoUsuario {
  id: string
  jaEnviado: boolean
  matches: MatchParaResumo[]
}

async function matchesNovosDoUsuario(userId: string, agora: Date): Promise<MatchesNovosDoUsuario> {
  const id = idDoResumoDiario(userId, diaDeBrasilia(agora))
  const enviados = await resumosEnviados(userId, agora)
  if (enviados.idsJaEnviados.has(id)) return { id, matches: [], jaEnviado: true }

  const encontrados = await prisma.tenderMatch.findMany({
    where: {
      userId,
      createdAt: { gte: enviados.inicioDaJanela, lte: agora },
      id: { notIn: enviados.matchesJaEnviados },
      tenderId: { notIn: enviados.licitacoesJaEnviadas },
      tender: whereDaLicitacaoNoFeed({}, agora),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      dentroDeObraCompleta: true,
      monitoredItem: { select: { name: true } },
      tender: {
        select: { id: true, objeto: true, objetoResumido: true, fonte: true, orgao: true, municipio: true, uf: true, encerramentoAt: true, aberturaAt: true },
      },
    },
  })

  return {
    id,
    jaEnviado: false,
    matches: encontrados.map((m) => ({
      tenderMatchId: m.id,
      itemName: m.monitoredItem.name,
      dentroDeObraCompleta: m.dentroDeObraCompleta,
      licitacao: {
        tenderId: m.tender.id,
        objeto: m.tender.objetoResumido ?? m.tender.objeto,
        fonte: m.tender.fonte,
        orgao: m.tender.orgao,
        municipio: m.tender.municipio,
        uf: m.tender.uf,
        encerramentoAt: m.tender.encerramentoAt,
        aberturaAt: m.tender.aberturaAt,
      },
    })),
  }
}

export async function enviarResumoDoUsuario(userId: string, agora: Date = new Date()): Promise<ResultadoDoResumo> {
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: SELECT_DO_DESTINATARIO })
  if (!usuario || acessoDoDestinatarioComEmpresa(usuario, agora.getTime()).situacao !== 'ativo') return 'sem-acesso'

  const { id, matches, jaEnviado } = await matchesNovosDoUsuario(userId, agora)
  if (jaEnviado) return 'ja-enviado'
  const licitacoes = agruparMatchesDoResumo(matches)
  if (licitacoes.length === 0) return 'sem-novidade'

  const reservado = await reservarNotificacao(
    {
      id,
      userId,
      title: 'Resumo diário de licitações',
      body: `${quantidadeCom(licitacoes.length, 'licitação nova', 'licitações novas')} no resumo.`,
      metadata: {
        resumoDiario: diaDeBrasilia(agora),
        tenderMatchIds: licitacoes.flatMap((l) => l.tenderMatchIds),
        tenderIds: licitacoes.map((l) => l.tenderId),
      },
    },
    agora
  )
  if (!reservado) return 'ja-enviado'

  try {
    if (!(await sendResumoDiarioEmail(usuario.email, licitacoes))) {
      await desfazerReservas([id])
      return 'nao-enviado'
    }
  } catch (err) {
    await desfazerReservas([id])
    throw err
  }
  await confirmarEnvio([id], agora)
  return 'enviado'
}

export async function enviarResumosDiarios(agora: Date = new Date()): Promise<ResumosDoDia> {
  const candidatos = await prisma.tenderMatch.findMany({
    where: { createdAt: { gte: new Date(agora.getTime() - RETROSPECTIVA_MAXIMA_MS), lte: agora }, tender: whereDaLicitacaoNoFeed({}, agora) },
    distinct: ['userId'],
    select: { userId: true },
  })

  const resultado: ResumosDoDia = { usuarios: candidatos.length, enviados: 0, falhas: 0 }
  for (const { userId } of candidatos) {
    try {
      if ((await enviarResumoDoUsuario(userId, agora)) === 'enviado') resultado.enviados++
    } catch (err) {
      resultado.falhas++
      console.error(`[Resumo diário] Falha ao enviar para o usuário ${userId}:`, err instanceof Error ? err.message : err)
    }
  }
  return resultado
}
