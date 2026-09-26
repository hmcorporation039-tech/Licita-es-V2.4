// ============================================================
// workers/index.ts — Entrypoint dos workers
// Execute: npx ts-node src/workers/index.ts
// ============================================================

import 'dotenv/config'
import { dispararColetaInicial, scheduleColetorJobs } from '../queues'
import { startColetorPNCPWorker } from './coletorPNCP'
import { startColetorComprasnetWorker } from './coletorComprasnet'
import { startMatcherWorker } from './matcher'
import { startNotificadorWorker } from './notificador'
import { startAnaliseWorker } from './analise'
import { refreshAllOpenSituacoes } from '../services/situacaoUpdateService'
import { cleanupOldUnmatchedTenders, cleanupOldWorkerLogs } from '../services/retentionService'
import { checkExpiringDocuments } from '../services/documentAlertService'

async function main() {
  console.log('🚀 Iniciando workers da plataforma de licitações...')

  // Sobe os workers em paralelo
  const workerPNCP = startColetorPNCPWorker()
  const workerComprasnet = startColetorComprasnetWorker()
  const workerMatcher = startMatcherWorker()
  const workerNotificador = startNotificadorWorker()
  const workerAnalise = startAnaliseWorker()

  console.log('✅ Workers ativos: PNCP, ComprasNet, Matcher, Notificador, Análise')

  // Agenda coletas periódicas — envolvido em try/catch de propósito: isso
  // roda toda vez que o processo sobe, então se o Redis estiver indisponível
  // (ex: cota do plano gratuito do Upstash estourada), uma falha aqui não
  // pode derrubar o processo inteiro (senão o Railway reinicia, bate na
  // mesma falha de novo, e entra em crash-loop — foi exatamente isso que
  // aconteceu e inundou os logs do serviço).
  try {
    await scheduleColetorJobs()
    await dispararColetaInicial()

    console.log('📥 Coleta inicial disparada.')
  } catch (err) {
    console.error('[Startup] Erro ao agendar jobs de coleta (Redis indisponível?) — workers seguem no ar:', err)
  }

  // Reconsulta a situação real das licitações do PNCP periodicamente — a
  // coleta só grava o status no momento da publicação e nunca mais. Não usa
  // fila do BullMQ de propósito (varredura simples, o Redis já está no
  // limite do plano gratuito — ver situacaoUpdateService.ts).
  async function runSituacaoRefresh() {
    console.log('[SituaçãoUpdate] Iniciando varredura de situação...')
    try {
      const { checked, updated } = await refreshAllOpenSituacoes()
      console.log(`[SituaçãoUpdate] Concluído — ${checked} verificada(s), ${updated} atualizada(s).`)
    } catch (err) {
      console.error('[SituaçãoUpdate] Erro na varredura:', err)
    }
  }
  setTimeout(runSituacaoRefresh, 5 * 60 * 1000) // primeira execução 5min após o start
  setInterval(runSituacaoRefresh, 12 * 60 * 60 * 1000) // depois, a cada 12h

  // Limpa licitações antigas sem match, pra não deixar o banco crescer
  // indefinidamente com dado que ninguém nunca viu (ver retentionService.ts).
  async function runCleanup() {
    console.log('[Retenção] Iniciando limpeza de licitações sem interação...')
    try {
      const { deleted, encerradas, antigas } = await cleanupOldUnmatchedTenders()
      console.log(
        `[Retenção] Concluído — ${deleted} licitação(ões) removida(s) (${encerradas} encerrada(s), ${antigas} antiga(s)).`
      )
      const { deleted: logs } = await cleanupOldWorkerLogs()
      console.log(`[Retenção] ${logs} log(s) de worker removido(s).`)
    } catch (err) {
      console.error('[Retenção] Erro na limpeza:', err)
    }
  }
  setTimeout(runCleanup, 10 * 60 * 1000) // primeira execução 10min após o start
  setInterval(runCleanup, 24 * 60 * 60 * 1000) // depois, uma vez por dia

  // Avisa por e-mail quando um documento do cofre da empresa está perto de
  // vencer (ver documentAlertService.ts).
  async function runDocumentAlerts() {
    console.log('[DocumentAlert] Verificando documentos perto do vencimento...')
    try {
      const { checked, alerted } = await checkExpiringDocuments()
      console.log(`[DocumentAlert] Concluído — ${checked} verificado(s), ${alerted} aviso(s) enviado(s).`)
    } catch (err) {
      console.error('[DocumentAlert] Erro na verificação:', err)
    }
  }
  setTimeout(runDocumentAlerts, 15 * 60 * 1000) // primeira execução 15min após o start
  setInterval(runDocumentAlerts, 24 * 60 * 60 * 1000) // depois, uma vez por dia

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Encerrando workers...')
    await workerPNCP.close()
    await workerComprasnet.close()
    await workerMatcher.close()
    await workerNotificador.close()
    await workerAnalise.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Erro fatal ao iniciar workers:', err)
  process.exit(1)
})
