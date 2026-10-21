// ============================================================
// workers/notificador.ts — Agente Notificador
// Consome a fila 'notificador': resumo diário dos matches novos (07:00),
// lembrete de prazo das licitações escolhidas (de hora em hora) e aviso
// para quem acompanha uma licitação quando o órgão a republica com
// prazo/valor/edital diferente.
// ============================================================

import { Worker, Job } from 'bullmq'
import { notificadorQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma } from '../services/tenderService'
import { ROTULO_CAMPO_ALTERADO, sendTenderChangedEmail } from '../services/emailService'
import { NotificadorAlteracaoPayload, NotificadorCelularPayload, NotificadorJobPayload, NotificadorMatchPayload, NotificadorRotinaPayload } from '../types'
import { enviarResumosDiarios } from '../services/resumoDiario'
import { enviarLembretesDePrazo } from '../services/lembreteDePrazo'
import { estaAberta } from '../lib/licitacaoAberta'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa, avisarFimDoAcessoUmaVez } from '../services/avisoDeAcessoEncerrado'
import { linksDeDescadastro } from '../lib/descadastro'
import { mensagemDeAlteracao } from '../lib/notificacaoNoCelular'
import {
  ESPERA_PARA_AGRUPAR_MS,
  avisarNovasLicitacoesNoCelular,
  enviarNoCelular,
  idDoAgrupamentoDeNovas,
  querNovasLicitacoesNoCelular,
} from '../services/notificacaoNoCelular'

async function jaNotificado(caminho: string[], valor: string): Promise<boolean> {
  const existente = await prisma.notification.findFirst({
    where: { metadata: { path: caminho, equals: valor } },
    select: { id: true },
  })
  return existente !== null
}

export async function processarMatch(payload: NotificadorMatchPayload): Promise<void> {
  const match = await prisma.tenderMatch.findUnique({
    where: { id: payload.tenderMatchId },
    include: { tender: true, user: { select: SELECT_DO_DESTINATARIO } },
  })
  if (!match || !estaAberta(match.tender)) return

  const acesso = acessoDoDestinatarioComEmpresa(match.user)
  if (acesso.situacao === 'encerrado') await avisarFimDoAcessoUmaVez(match.user, acesso.acessoAte)
  if (acesso.situacao === 'ativo' && !match.dentroDeObraCompleta) await agendarAvisoDeNovasLicitacoes(match.userId)
}

export async function agendarAvisoDeNovasLicitacoes(userId: string): Promise<boolean> {
  if (!(await querNovasLicitacoesNoCelular(userId))) return false
  const dados: NotificadorCelularPayload = { tipo: 'celular-novas-licitacoes', userId }
  return enfileirarSemTravar(notificadorQueue, 'celular-novas-licitacoes', dados, 'Notificador Worker', {
    jobId: idDoAgrupamentoDeNovas(userId),
    delay: ESPERA_PARA_AGRUPAR_MS,
    removeOnComplete: true,
    removeOnFail: true,
  })
}

async function avisarAlteracaoNoCelular(userId: string, tender: { id: string; objeto: string; objetoResumido: string | null }, campos: string[], chave: string) {
  try {
    if (await jaNotificado(['celularTenderChangeKey'], chave)) return
    const rotulos = campos.map((campo) => ROTULO_CAMPO_ALTERADO[campo] ?? campo)
    const mensagem = mensagemDeAlteracao(tender.id, tender.objetoResumido ?? tender.objeto, rotulos)
    if ((await enviarNoCelular(userId, mensagem)).entregues === 0) return
    await prisma.notification.create({
      data: { userId, type: 'PUSH', title: mensagem.titulo, body: mensagem.corpo, sentAt: new Date(), metadata: { celularTenderChangeKey: chave, tenderId: tender.id, campos } },
    })
  } catch (err) {
    console.error(`[Notificador Worker] Falha no aviso de alteração pelo celular do usuário ${userId}:`, err instanceof Error ? err.message : err)
  }
}

async function processarRotina(payload: NotificadorRotinaPayload): Promise<void> {
  if (payload.tipo === 'resumo-diario') {
    const { usuarios, enviados, falhas } = await enviarResumosDiarios()
    console.log(`[Notificador Worker] Resumo diário: ${enviados} enviado(s), ${falhas} falha(s), ${usuarios} usuário(s) com match recente.`)
    if (falhas > 0) throw new Error(`${falhas} resumo(s) diário(s) não enviado(s)`)
    return
  }
  const { empresas, enviados, falhas, noCelular } = await enviarLembretesDePrazo()
  console.log(`[Notificador Worker] Lembrete de prazo: ${enviados} enviado(s), ${noCelular} no celular, ${falhas} falha(s), ${empresas} empresa(s) com prazo perto do fim.`)
  if (falhas > 0) throw new Error(`${falhas} lembrete(s) de prazo não enviado(s)`)
}

export async function processarAlteracao(payload: NotificadorAlteracaoPayload): Promise<void> {
  const { tenderId, userId, campos } = payload

  // A chave de idempotência inclui os campos alterados: uma segunda
  // prorrogação da mesma licitação é um aviso novo, não uma repetição.
  const chave = `${tenderId}:${userId}:${[...campos].sort().join(',')}`

  const [tender, user] = await Promise.all([
    prisma.tender.findUnique({ where: { id: tenderId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { ...SELECT_DO_DESTINATARIO, receberAvisoDeAlteracao: true, celularAvisoDeAlteracao: true } }),
  ])
  if (!tender || !user || acessoDoDestinatarioComEmpresa(user).situacao !== 'ativo') return
  if (user.celularAvisoDeAlteracao) await avisarAlteracaoNoCelular(user.id, tender, campos, chave)
  if (!user.receberAvisoDeAlteracao || (await jaNotificado(['tenderChangeKey'], chave))) return

  await sendTenderChangedEmail({
    to: user.email,
    tenderObjeto: tender.objetoResumido ?? tender.objeto,
    campos,
    orgao: tender.orgao,
    encerramentoAt: tender.encerramentoAt,
    fonte: tender.fonte,
    linkEdital: tender.linkEdital,
    descadastro: linksDeDescadastro(user.id, 'aviso-de-alteracao'),
  })

  await prisma.notification.create({
    data: {
      userId,
      type: 'EMAIL',
      title: 'Licitação alterada pelo órgão',
      body: tender.objetoResumido ?? tender.objeto,
      sentAt: new Date(),
      metadata: { tenderChangeKey: chave, tenderId, campos },
    },
  })

  console.log(`[Notificador Worker] Aviso de alteração enviado para o usuário ${user.id} (tender ${tenderId})`)
}

export function startNotificadorWorker() {
  const worker = new Worker<NotificadorJobPayload>(
    'notificador',
    async (job: Job<NotificadorJobPayload>) => {
      const dados = job.data
      if ('tenderMatchId' in dados) {
        await processarMatch(dados)
        return
      }
      if (dados.tipo === 'alteracao') {
        await processarAlteracao(dados)
        return
      }
      if (dados.tipo === 'celular-novas-licitacoes') {
        await avisarNovasLicitacoesNoCelular(dados.userId)
        return
      }
      await processarRotina(dados)
    },
    {
      connection: redisConnection,
      concurrency: 3,
      // Ver comentário equivalente em coletorPNCP.ts — reduz o gasto de
      // requisições do Redis (limite do plano gratuito do Upstash).
      stalledInterval: 300_000, // 5min
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Notificador Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
