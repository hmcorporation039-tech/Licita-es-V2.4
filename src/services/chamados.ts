import type { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { avisarAdministrador } from './alertaOperacional'
import { enviarNoCelular } from './notificacaoNoCelular'
import { enviarRespostaDoChamado } from './emailTransacional'
import { appUrl } from '../lib/appUrl'
import {
  DIAS_DE_GUARDA_DO_CHAMADO_RESOLVIDO,
  MAX_ERROS_RECENTES_NO_CHAMADO,
  cortar,
  proximoStatusAoResponder,
  rotaSemConsulta,
  versaoDoSistema,
  type AutorDaMensagem,
  type ContextoDoChamado,
  type ErroRecenteDaTela,
  type OrigemDoChamado,
  type StatusDeChamado,
  type TipoDeChamado,
} from '../lib/suporte'

export const ROTULO_DO_TIPO: Record<TipoDeChamado, string> = {
  ERRO: 'Erro no sistema',
  DUVIDA: 'Dúvida',
  COBRANCA: 'Cobrança',
  SUGESTAO: 'Sugestão',
  OUTRO: 'Outro assunto',
}

export interface NovoChamado {
  companyId: string
  userId: string
  tipo: TipoDeChamado
  assunto: string
  relato: string
  origem?: OrigemDoChamado
  tela?: string | null
  navegador?: string | null
  errosRecentes?: ErroRecenteDaTela[]
}

export function montarContexto(novo: NovoChamado, agora: Date): ContextoDoChamado {
  return {
    tela: novo.tela ? rotaSemConsulta(novo.tela) : null,
    navegador: cortar(novo.navegador, 300),
    horario: agora.toISOString(),
    versao: versaoDoSistema(),
    errosRecentes: (novo.errosRecentes ?? []).slice(-MAX_ERROS_RECENTES_NO_CHAMADO).map((e) => ({
      codigo: cortar(e.codigo, 64) ?? undefined,
      rota: e.rota ? rotaSemConsulta(e.rota) : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      mensagem: cortar(e.mensagem, 300) ?? undefined,
      quando: cortar(e.quando, 40) ?? undefined,
    })),
  }
}

async function avisarAdminsNoCelular(titulo: string, corpo: string, url: string, tag: string) {
  const admins = await prisma.user.findMany({ where: { isAdmin: true, active: true }, select: { id: true } })
  await Promise.all(admins.map((a) => enviarNoCelular(a.id, { titulo, corpo, url, tag }, { urgente: true })))
}

export async function abrirChamado(novo: NovoChamado, agora: Date = new Date()) {
  const chamado = await prisma.chamado.create({
    data: {
      companyId: novo.companyId,
      userId: novo.userId,
      tipo: novo.tipo,
      origem: novo.origem ?? 'FORMULARIO',
      assunto: novo.assunto,
      relato: novo.relato,
      contexto: montarContexto(novo, agora) as unknown as Prisma.InputJsonValue,
      createdAt: agora,
    },
    include: { company: { select: { name: true } }, user: { select: { name: true, email: true } } },
  })
  const link = `${appUrl()}/admin/chamados/${chamado.numero}`
  const quem = `${chamado.user?.name ?? chamado.user?.email ?? 'Usuário'} (${chamado.company.name})`
  void avisarAdministrador(
    `chamado-${chamado.numero}`,
    `Chamado #${chamado.numero} aberto — ${ROTULO_DO_TIPO[novo.tipo]}`,
    `${quem}\nAssunto: ${novo.assunto}\n\n${novo.relato.slice(0, 1200)}\n\nAbrir: ${link}`
  )
  void avisarAdminsNoCelular(`Chamado #${chamado.numero}: ${ROTULO_DO_TIPO[novo.tipo]}`, `${quem}: ${novo.assunto}`.slice(0, 180), `/admin/chamados/${chamado.numero}`, `chamado-${chamado.numero}`).catch(() => undefined)
  return chamado
}

export async function responderChamado(args: { chamadoId: string; autor: AutorDaMensagem; userId: string; texto: string }, agora: Date = new Date()) {
  const chamado = await prisma.chamado.findUniqueOrThrow({
    where: { id: args.chamadoId },
    select: { id: true, numero: true, assunto: true, status: true, userId: true, company: { select: { name: true } }, user: { select: { email: true, active: true } } },
  })
  const status = proximoStatusAoResponder(args.autor, chamado.status as StatusDeChamado)
  const [mensagem] = await prisma.$transaction([
    prisma.chamadoMensagem.create({ data: { chamadoId: chamado.id, autor: args.autor, userId: args.userId, texto: args.texto, createdAt: agora } }),
    prisma.chamado.update({ where: { id: chamado.id }, data: { status, resolvidoEm: status === 'RESOLVIDO' ? undefined : null, updatedAt: agora } }),
  ])
  if (args.autor === 'SUPORTE' && chamado.userId && chamado.user?.active) {
    void enviarRespostaDoChamado(chamado.user.email, chamado, args.texto)
    void enviarNoCelular(chamado.userId, {
      titulo: `Resposta ao chamado #${chamado.numero}`,
      corpo: args.texto.slice(0, 180),
      url: `/suporte/chamados/${chamado.numero}`,
      tag: `chamado-${chamado.numero}`,
    }).catch(() => undefined)
  }
  if (args.autor === 'CLIENTE') {
    void avisarAdministrador(
      `chamado-${chamado.numero}-resposta`,
      `Chamado #${chamado.numero} — o cliente respondeu`,
      `${chamado.company.name}\nAssunto: ${chamado.assunto}\n\n${args.texto.slice(0, 1200)}\n\nAbrir: ${appUrl()}/admin/chamados/${chamado.numero}`
    )
  }
  return { mensagem, status }
}

export async function mudarStatusDoChamado(chamadoId: string, status: StatusDeChamado, agora: Date = new Date()) {
  return prisma.chamado.update({
    where: { id: chamadoId },
    data: { status, resolvidoEm: status === 'RESOLVIDO' ? agora : null, updatedAt: agora },
    select: { numero: true, status: true, resolvidoEm: true },
  })
}

export async function apagarChamadosAntigos(agora: Date = new Date()): Promise<{ apagados: number }> {
  const corte = new Date(agora.getTime() - DIAS_DE_GUARDA_DO_CHAMADO_RESOLVIDO * 24 * 60 * 60 * 1000)
  const { count } = await prisma.chamado.deleteMany({ where: { status: 'RESOLVIDO', resolvidoEm: { lt: corte } } })
  return { apagados: count }
}
