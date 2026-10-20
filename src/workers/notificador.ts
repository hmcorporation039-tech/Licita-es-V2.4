// ============================================================
// workers/notificador.ts — Agente Notificador
// Consome a fila 'notificador': resumo diário dos matches novos (07:00),
// lembrete de prazo das licitações escolhidas (de hora em hora) e aviso
// para quem acompanha uma licitação quando o órgão a republica com
// prazo/valor/edital diferente.
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../queues'
import { prisma } from '../services/tenderService'
import { sendTenderChangedEmail } from '../services/emailService'
import { NotificadorAlteracaoPayload, NotificadorJobPayload, NotificadorMatchPayload, NotificadorRotinaPayload } from '../types'
import { enviarResumosDiarios } from '../services/resumoDiario'
import { enviarLembretesDePrazo } from '../services/lembreteDePrazo'
import { estaAberta } from '../lib/licitacaoAberta'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa, avisarFimDoAcessoUmaVez } from '../services/avisoDeAcessoEncerrado'

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
}

async function processarRotina(payload: NotificadorRotinaPayload): Promise<void> {
  if (payload.tipo === 'resumo-diario') {
    const { usuarios, enviados, falhas } = await enviarResumosDiarios()
    console.log(`[Notificador Worker] Resumo diário: ${enviados} enviado(s), ${falhas} falha(s), ${usuarios} usuário(s) com match recente.`)
    if (falhas > 0) throw new Error(`${falhas} resumo(s) diário(s) não enviado(s)`)
    return
  }
  const { empresas, enviados, falhas } = await enviarLembretesDePrazo()
  console.log(`[Notificador Worker] Lembrete de prazo: ${enviados} enviado(s), ${falhas} falha(s), ${empresas} empresa(s) com prazo perto do fim.`)
  if (falhas > 0) throw new Error(`${falhas} lembrete(s) de prazo não enviado(s)`)
}

async function processarAlteracao(payload: NotificadorAlteracaoPayload): Promise<void> {
  const { tenderId, userId, campos } = payload

  // A chave de idempotência inclui os campos alterados: uma segunda
  // prorrogação da mesma licitação é um aviso novo, não uma repetição.
  const chave = `${tenderId}:${userId}:${[...campos].sort().join(',')}`
  if (await jaNotificado(['tenderChangeKey'], chave)) return

  const [tender, user] = await Promise.all([
    prisma.tender.findUnique({ where: { id: tenderId } }),
    prisma.user.findUnique({ where: { id: userId }, select: SELECT_DO_DESTINATARIO }),
  ])
  if (!tender || !user || acessoDoDestinatarioComEmpresa(user).situacao !== 'ativo') return

  await sendTenderChangedEmail({
    to: user.email,
    tenderObjeto: tender.objetoResumido ?? tender.objeto,
    campos,
    orgao: tender.orgao,
    encerramentoAt: tender.encerramentoAt,
    fonte: tender.fonte,
    linkEdital: tender.linkEdital,
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

  console.log(`[Notificador Worker] Aviso de alteração enviado para ${user.email} (tender ${tenderId})`)
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
