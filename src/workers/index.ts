// ============================================================
// workers/index.ts — Entrypoint dos workers
// Execute: npx ts-node src/workers/index.ts
// ============================================================

import 'dotenv/config'
import { COLETOR_SCHEDULERS, agendarAvisosPorEmail, dispararColetaInicial, scheduleColetorJobs } from '../queues'
import { startColetorPNCPWorker } from './coletorPNCP'
import { startColetorNovacapWorker } from './coletorNovacap'
import { startColetorFiegWorker } from './coletorFieg'
import { startColetorSescGoWorker } from './coletorSescGo'
import { startColetorSestSenatWorker } from './coletorSestSenat'
import { startColetorSescRegionalWorker } from './coletorSescRegional'
import { startColetorQueridoDiarioWorker } from './coletorQueridoDiario'
import { startColetorSistemaSWorker } from './coletorSistemaS'
import { startColetorInfraeroWorker } from './coletorInfraero'
import { startColetorDiarioMunicipalWorker } from './coletorDiarioMunicipal'
import { startColetorTceCeWorker } from './coletorTceCe'
import { startColetorTcePiWorker } from './coletorTcePi'
import { startColetorTceToWorker } from './coletorTceTo'
import { startColetorTceRsWorker } from './coletorTceRs'
import { startColetorFamemWorker } from './coletorFamem'
import { startMatcherWorker } from './matcher'
import { startNotificadorWorker } from './notificador'
import { startAnaliseWorker } from './analise'
import { startRematchItemWorker } from './rematchItem'
import { refreshAllOpenSituacoes } from '../services/situacaoUpdateService'
import { anonimizarAuditoriaAntiga, cleanupOldUnmatchedTenders, cleanupOldWorkerLogs } from '../services/retentionService'
import { apagarTextosDeEditaisAntigos } from '../services/textosDoEdital'
import { checkExpiringDocuments } from '../services/documentAlertService'
import { configuracaoDeIa } from '../services/analiseEmDupla'
import { textoDoDiagnostico } from '../lib/diagnosticoDeChave'
import { alertarFalha, instalarAlertasDoProcesso } from '../services/alertaOperacional'
import { preencherAnoDoProcesso } from '../services/anoDoProcessoBackfill'
import { verificarColetoresParados } from '../services/saudeDosColetores'

async function main() {
  console.log('🚀 Iniciando workers da plataforma de licitações...')

  // Sobe os workers em paralelo
  const workerPNCP = startColetorPNCPWorker()
  const workerNovacap = startColetorNovacapWorker()
  const workerFieg = startColetorFiegWorker()
  const workerSescGo = startColetorSescGoWorker()
  const workerSestSenat = startColetorSestSenatWorker()
  const workerSescRegional = startColetorSescRegionalWorker()
  const workerQueridoDiario = startColetorQueridoDiarioWorker()
  const workerSistemaS = startColetorSistemaSWorker()
  const workerInfraero = startColetorInfraeroWorker()
  const workerDiarioMunicipal = startColetorDiarioMunicipalWorker()
  const workerTceCe = startColetorTceCeWorker()
  const workerTcePi = startColetorTcePiWorker()
  const workerTceTo = startColetorTceToWorker()
  const workerTceRs = startColetorTceRsWorker()
  const workerFamem = startColetorFamemWorker()
  const workerMatcher = startMatcherWorker()
  const workerNotificador = startNotificadorWorker()
  const workerAnalise = startAnaliseWorker()
  const workerRematchItem = startRematchItemWorker()

  console.log('✅ Workers ativos: PNCP, Novacap, FIEG, SESC GO, SEST SENAT, SESC Regionais, Querido Diário, Sistema S, Infraero, Diários municipais, TCE-CE, TCE-PI, TCE-TO, TCE-RS, FAMEM, Matcher, Notificador, Análise, Busca do item')

  // Alerta ao administrador só na falha DEFINITIVA (esgotadas as tentativas): uma tentativa
  // que falha e depois dá certo (portal instável) não é motivo para acordar ninguém.
  instalarAlertasDoProcesso('workers')
  const todos = [workerPNCP, workerNovacap, workerFieg, workerSescGo, workerSestSenat, workerSescRegional, workerQueridoDiario, workerSistemaS, workerInfraero, workerDiarioMunicipal, workerTceCe, workerTcePi, workerTceTo, workerTceRs, workerFamem, workerMatcher, workerNotificador, workerAnalise, workerRematchItem]
  for (const w of todos) {
    w.on('failed', (job, err) => {
      const tentativas = job?.opts?.attempts ?? 1
      if (job && job.attemptsMade < tentativas) return
      void alertarFalha('worker ' + w.name, job?.name ?? 'job', err)
    })
  }

  // Estado da análise por IA no log de partida: modo e FORMATO das chaves (tamanho,
  // prefixo, espaços/aspas), nunca as chaves. Quem investiga um "API key is invalid"
  // vê aqui, logo ao subir, se a variável chegou diferente do que se copiou.
  const ia = configuracaoDeIa()
  console.log(
    `[IA] análise ${process.env.AI_ANALYSIS_ENABLED === 'true' ? 'LIGADA' : 'desligada'} · modo: ${ia.modo ?? 'nenhum'}` +
      (ia.modo === 'dupla' ? ' (Gemini analisa, Claude revisa)' : '') +
      ` · ${textoDoDiagnostico()}`
  )
  ia.avisos.forEach((a) => console.warn(`[IA] AVISO: ${a}`))

  // Agenda coletas periódicas — envolvido em try/catch de propósito: isso
  // roda toda vez que o processo sobe, então se o Redis estiver indisponível
  // (ex: cota do plano gratuito do Upstash estourada), uma falha aqui não
  // pode derrubar o processo inteiro (senão o Railway reinicia, bate na
  // mesma falha de novo, e entra em crash-loop — foi exatamente isso que
  // aconteceu e inundou os logs do serviço).
  try {
    await scheduleColetorJobs()
    await agendarAvisosPorEmail()
    await dispararColetaInicial()

    console.log('📥 Coleta inicial disparada.')
  } catch (err) {
    console.error('[Startup] Erro ao agendar jobs de coleta (Redis indisponível?) — workers seguem no ar:', err)
  }

  // Reconsulta a situação real das licitações do PNCP periodicamente — a
  // coleta só grava o status no momento da publicação e nunca mais. Não usa
  // fila do BullMQ de propósito (varredura simples, o Redis já está no
  // limite do plano gratuito — ver situacaoUpdateService.ts).
  preencherAnoDoProcesso()
    .then((preenchidos) => {
      if (preenchidos > 0) console.log(`[AnoDoProcesso] ${preenchidos} licitação(ões) com o ano do processo preenchido.`)
    })
    .catch((err) => console.error('[AnoDoProcesso] Erro ao preencher o ano do processo:', err))

  async function runSituacaoRefresh() {
    console.log('[SituaçãoUpdate] Iniciando varredura de situação...')
    try {
      const { checked, updated } = await refreshAllOpenSituacoes()
      console.log(`[SituaçãoUpdate] Concluído — ${checked} verificada(s), ${updated} atualizada(s).`)
    } catch (err) {
      console.error('[SituaçãoUpdate] Erro na varredura:', err)
      void alertarFalha('rotina', 'situação', err)
    }
  }
  setTimeout(runSituacaoRefresh, 5 * 60 * 1000) // primeira execução 5min após o start
  setInterval(runSituacaoRefresh, 12 * 60 * 60 * 1000) // depois, a cada 12h

  // Limpa licitações antigas sem match, pra não deixar o banco crescer
  // indefinidamente com dado que ninguém nunca viu (ver retentionService.ts).
  async function runCleanup() {
    console.log('[Retenção] Iniciando limpeza de licitações sem interação...')
    try {
      const { deleted, encerradas, homologadas, antigas } = await cleanupOldUnmatchedTenders()
      console.log(
        `[Retenção] Concluído — ${deleted} licitação(ões) removida(s) (${encerradas} encerrada(s), ${homologadas} homologada(s), ${antigas} antiga(s)).`
      )
      const { deleted: logs } = await cleanupOldWorkerLogs()
      console.log(`[Retenção] ${logs} log(s) de worker removido(s).`)
      const { anonimizados } = await anonimizarAuditoriaAntiga()
      console.log(`[Retenção] ${anonimizados} registro(s) de auditoria com mais de 5 anos anonimizado(s).`)
      const { licitacoes } = await apagarTextosDeEditaisAntigos()
      console.log(`[Retenção] Texto guardado para a conversa apagado de ${licitacoes} licitação(ões) encerrada(s).`)
    } catch (err) {
      console.error('[Retenção] Erro na limpeza:', err)
      void alertarFalha('rotina', 'retenção', err)
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
      void alertarFalha('rotina', 'alerta de documentos', err)
    }
  }
  setTimeout(runDocumentAlerts, 15 * 60 * 1000) // primeira execução 15min após o start
  setInterval(runDocumentAlerts, 24 * 60 * 60 * 1000) // depois, uma vez por dia

  const fontesAgendadas = [...new Set(COLETOR_SCHEDULERS.map((s) => s.fonte))]
  async function runSaudeDosColetores() {
    try {
      const parados = await verificarColetoresParados(fontesAgendadas)
      console.log(`[Saúde dos coletores] ${parados.length === 0 ? 'Todas as fontes coletaram nas últimas 24 h.' : `${parados.length} fonte(s) sem coleta nas últimas 24 h.`}`)
    } catch (err) {
      console.error('[Saúde dos coletores] Erro na verificação:', err)
    }
  }
  setTimeout(runSaudeDosColetores, 60 * 60 * 1000)
  setInterval(runSaudeDosColetores, 6 * 60 * 60 * 1000)

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Encerrando workers...')
    await workerPNCP.close()
    await workerNovacap.close()
    await workerFieg.close()
    await workerSescGo.close()
    await workerSestSenat.close()
    await workerSescRegional.close()
    await workerQueridoDiario.close()
    await workerSistemaS.close()
    await workerInfraero.close()
    await workerDiarioMunicipal.close()
    await workerTceCe.close()
    await workerTcePi.close()
    await workerTceTo.close()
    await workerTceRs.close()
    await workerFamem.close()
    await workerMatcher.close()
    await workerNotificador.close()
    await workerAnalise.close()
    await workerRematchItem.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Erro fatal ao iniciar workers:', err)
  process.exit(1)
})
