import type { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { sendLembreteDePrazoEmail, type LicitacaoDoLembrete } from './emailService'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa } from './avisoDeAcessoEncerrado'
import { confirmarEnvio, desfazerReservas, reservarNotificacao } from './reservaDeNotificacao'
import { enviarNoCelular, temAparelhoNoCelular } from './notificacaoNoCelular'
import { mensagemDoLembreteDePrazo } from '../lib/notificacaoNoCelular'
import { linksDeDescadastro } from '../lib/descadastro'
import { MARCOS_DO_LEMBRETE_EM_HORAS, marcoDoLembrete, momentoDoFimDoPrazo, type MarcoDoLembrete } from '../lib/prazoDoAviso'

const HORA_MS = 60 * 60 * 1000
const MAIOR_MARCO_MS = Math.max(...MARCOS_DO_LEMBRETE_EM_HORAS) * HORA_MS
const FOLGA_DO_DIA_SEM_HORA_MS = 24 * HORA_MS

export interface LembretesDaRodada {
  empresas: number
  enviados: number
  falhas: number
  noCelular: number
}

interface LicitacaoNaJanela {
  licitacao: LicitacaoDoLembrete
  marco: MarcoDoLembrete
}

export function idDoLembreteDePrazo(userId: string, tenderId: string, marco: MarcoDoLembrete): string {
  return `lembrete-de-prazo:${userId}:${tenderId}:${marco}h`
}

function whereDosPlanosPertoDoPrazo(agora: Date): Prisma.TenderParticipationPlanWhereInput {
  const janela = { gte: new Date(agora.getTime() - FOLGA_DO_DIA_SEM_HORA_MS), lte: new Date(agora.getTime() + MAIOR_MARCO_MS) }
  return {
    status: 'VOU_PARTICIPAR',
    tender: {
      situacao: 'ABERTA',
      valorHomologado: null,
      duplicataDe: null,
      motivoOculta: null,
      OR: [
        { encerramentoAt: janela, prazoImprovavel: false },
        { encerramentoAt: null, fonte: { notIn: ['PNCP', 'COMPRASNET'] }, aberturaAt: janela },
      ],
    },
  }
}

async function licitacoesNaJanela(companyId: string, agora: Date): Promise<LicitacaoNaJanela[]> {
  const planos = await prisma.tenderParticipationPlan.findMany({
    where: { companyId, ...whereDosPlanosPertoDoPrazo(agora) },
    select: {
      tender: {
        select: { id: true, objeto: true, objetoResumido: true, fonte: true, orgao: true, municipio: true, uf: true, encerramentoAt: true, aberturaAt: true },
      },
    },
  })
  return planos.flatMap(({ tender }) => {
    const fimDoPrazo = momentoDoFimDoPrazo(tender)
    const marco = fimDoPrazo ? marcoDoLembrete(fimDoPrazo, agora) : null
    if (!fimDoPrazo || !marco) return []
    return [
      {
        marco,
        licitacao: {
          tenderId: tender.id,
          objeto: tender.objetoResumido ?? tender.objeto,
          fonte: tender.fonte,
          orgao: tender.orgao,
          municipio: tender.municipio,
          uf: tender.uf,
          encerramentoAt: tender.encerramentoAt,
          aberturaAt: tender.aberturaAt,
          fimDoPrazo,
        },
      },
    ]
  })
}

async function reservarLembretesDoUsuario(userId: string, pendentes: LicitacaoNaJanela[], agora: Date) {
  const reservados: { id: string; licitacao: LicitacaoDoLembrete }[] = []
  for (const { licitacao, marco } of pendentes) {
    const id = idDoLembreteDePrazo(userId, licitacao.tenderId, marco)
    const reservado = await reservarNotificacao(
      { id, userId, title: `Lembrete de prazo (${marco} h)`, body: licitacao.objeto, metadata: { lembreteDePrazo: `${marco}h`, tenderId: licitacao.tenderId } },
      agora
    )
    if (reservado) reservados.push({ id, licitacao })
  }
  return reservados
}

export function idDoLembreteNoCelular(userId: string, tenderId: string, marco: MarcoDoLembrete): string {
  return `celular-${idDoLembreteDePrazo(userId, tenderId, marco)}`
}

export async function avisarPrazoNoCelular(userId: string, pendentes: LicitacaoNaJanela[], agora: Date): Promise<boolean> {
  try {
    if (!(await temAparelhoNoCelular(userId))) return false
    const reservados: { id: string; licitacao: LicitacaoDoLembrete }[] = []
    for (const { licitacao, marco } of pendentes) {
      const id = idDoLembreteNoCelular(userId, licitacao.tenderId, marco)
      const metadata = { celularLembreteDePrazo: `${marco}h`, tenderId: licitacao.tenderId }
      if (await reservarNotificacao({ id, userId, type: 'PUSH', title: `Prazo no celular (${marco} h)`, body: licitacao.objeto, metadata }, agora)) {
        reservados.push({ id, licitacao })
      }
    }
    if (reservados.length === 0) return false
    const ids = reservados.map((r) => r.id)
    const mensagem = mensagemDoLembreteDePrazo(reservados.map((r) => r.licitacao), agora)
    if ((await enviarNoCelular(userId, mensagem, { urgente: true, agora })).entregues === 0) {
      await desfazerReservas(ids)
      return false
    }
    await confirmarEnvio(ids, agora)
    return true
  } catch (err) {
    console.error(`[Lembrete de prazo] Falha no aviso pelo celular do usuário ${userId}:`, err instanceof Error ? err.message : err)
    return false
  }
}

export async function enviarLembretesDaEmpresa(companyId: string, agora: Date = new Date()): Promise<{ enviados: number; falhas: number; noCelular: number }> {
  const pendentes = await licitacoesNaJanela(companyId, agora)
  if (pendentes.length === 0) return { enviados: 0, falhas: 0, noCelular: 0 }

  const usuarios = await prisma.user.findMany({ where: { companyId }, select: { ...SELECT_DO_DESTINATARIO, receberLembreteDePrazo: true, celularLembreteDePrazo: true } })
  let enviados = 0
  let falhas = 0
  let noCelular = 0
  for (const usuario of usuarios) {
    if (acessoDoDestinatarioComEmpresa(usuario, agora.getTime()).situacao !== 'ativo') continue
    if (usuario.celularLembreteDePrazo && (await avisarPrazoNoCelular(usuario.id, pendentes, agora))) noCelular++
    if (!usuario.receberLembreteDePrazo) continue
    const reservados = await reservarLembretesDoUsuario(usuario.id, pendentes, agora)
    if (reservados.length === 0) continue
    const ids = reservados.map((r) => r.id)
    try {
      const descadastro = linksDeDescadastro(usuario.id, 'lembrete-de-prazo')
      if (!(await sendLembreteDePrazoEmail(usuario.email, reservados.map((r) => r.licitacao), agora, descadastro))) {
        await desfazerReservas(ids)
        continue
      }
      await confirmarEnvio(ids, agora)
      enviados++
    } catch (err) {
      await desfazerReservas(ids)
      falhas++
      console.error(`[Lembrete de prazo] Falha ao enviar para o usuário ${usuario.id}:`, err instanceof Error ? err.message : err)
    }
  }
  return { enviados, falhas, noCelular }
}

export async function enviarLembretesDePrazo(agora: Date = new Date()): Promise<LembretesDaRodada> {
  const empresas = await prisma.tenderParticipationPlan.findMany({ where: whereDosPlanosPertoDoPrazo(agora), distinct: ['companyId'], select: { companyId: true } })
  const rodada: LembretesDaRodada = { empresas: empresas.length, enviados: 0, falhas: 0, noCelular: 0 }
  for (const { companyId } of empresas) {
    try {
      const resultado = await enviarLembretesDaEmpresa(companyId, agora)
      rodada.enviados += resultado.enviados
      rodada.falhas += resultado.falhas
      rodada.noCelular += resultado.noCelular
    } catch (err) {
      rodada.falhas++
      console.error(`[Lembrete de prazo] Falha na empresa ${companyId}:`, err instanceof Error ? err.message : err)
    }
  }
  return rodada
}
