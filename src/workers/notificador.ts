// ============================================================
// workers/notificador.ts — Agente Notificador
// Consome a fila 'notificador': avisa o dono do item monitorado quando
// há um match novo, e quem acompanha uma licitação quando o órgão a
// republica com prazo/valor/edital diferente.
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../queues'
import { prisma } from '../services/tenderService'
import { sendMatchEmail, sendTenderChangedEmail } from '../services/emailService'
import { NotificadorAlteracaoPayload, NotificadorJobPayload, NotificadorMatchPayload } from '../types'
import { limites } from '../lib/limites'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'
import { estaAberta } from '../lib/licitacaoAberta'

async function jaNotificado(caminho: string[], valor: string): Promise<boolean> {
  const existente = await prisma.notification.findFirst({
    where: { metadata: { path: caminho, equals: valor } },
    select: { id: true },
  })
  return existente !== null
}

export async function processarMatch(payload: NotificadorMatchPayload): Promise<void> {
  const { tenderMatchId } = payload

  if (await jaNotificado(['tenderMatchId'], tenderMatchId)) return

  const match = await prisma.tenderMatch.findUnique({
    where: { id: tenderMatchId },
    include: { tender: true, monitoredItem: true, user: true },
  })
  if (!match || !match.user.active) return
  if (!estaAberta(match.tender)) return

  const emailsHojeDaEmpresa = await prisma.notification.count({
    where: {
      type: 'EMAIL',
      sentAt: { gte: inicioDoDiaEmBrasilia(new Date()) },
      user: { companyId: match.companyId },
    },
  })
  if (emailsHojeDaEmpresa >= limites.maxEmailsDiaPorEmpresa) {
    console.log(
      `[Notificador Worker] Teto diário de ${limites.maxEmailsDiaPorEmpresa} e-mail(s) de match atingido pela empresa ${match.companyId} — match ${tenderMatchId} fica só na plataforma.`
    )
    return
  }

  await sendMatchEmail({
    to: match.user.email,
    itemName: match.monitoredItem.name,
    tenderId: match.tender.id,
    tenderObjeto: match.tender.objetoResumido ?? match.tender.objeto,
    fonte: match.tender.fonte,
    orgao: match.tender.orgao,
    municipio: match.tender.municipio,
    uf: match.tender.uf,
    valorEstimado: match.tender.valorEstimado ? Number(match.tender.valorEstimado) : null,
    encerramentoAt: match.tender.encerramentoAt,
    aberturaAt: match.tender.aberturaAt,
    linkEdital: match.tender.linkEdital,
  })

  await prisma.notification.create({
    data: {
      userId: match.userId,
      type: 'EMAIL',
      title: `Nova licitação: ${match.monitoredItem.name}`,
      body: match.tender.objetoResumido ?? match.tender.objeto,
      sentAt: new Date(),
      metadata: { tenderMatchId },
    },
  })

  console.log(`[Notificador Worker] E-mail enviado para ${match.user.email} (match ${tenderMatchId})`)
}

async function processarAlteracao(payload: NotificadorAlteracaoPayload): Promise<void> {
  const { tenderId, userId, campos } = payload

  // A chave de idempotência inclui os campos alterados: uma segunda
  // prorrogação da mesma licitação é um aviso novo, não uma repetição.
  const chave = `${tenderId}:${userId}:${[...campos].sort().join(',')}`
  if (await jaNotificado(['tenderChangeKey'], chave)) return

  const [tender, user] = await Promise.all([
    prisma.tender.findUnique({ where: { id: tenderId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, active: true } }),
  ])
  if (!tender || !user || !user.active) return

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
      if ('tenderMatchId' in job.data) {
        await processarMatch(job.data)
        return
      }
      await processarAlteracao(job.data)
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
