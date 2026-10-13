// ============================================================
// workers/coletorSestSenat.ts — Coleta SEST + SENAT (Sistema S nacional,
// não segue a Lei 14.133, não está garantido no PNCP).
//
// A API devolve o histórico nacional inteiro numa chamada só — não tem
// filtro de ano nem de situação que funcione no servidor (testado à
// exaustão, ver sestSenatParser.ts). Só entra o que está com situação
// "Edital Aberto" — licitação encerrada/executada não deve entrar no
// sistema em nenhuma fonte (mesmo princípio em coletorSescGo.ts,
// coletorFieg.ts, coletorNovacap.ts). O custo de rede/parse por ciclo é
// maior que os outros coletores, mas o de escrita no banco não é — só
// entra o que passa no filtro, e o dedupe de sempre cuida do resto.
// ============================================================

import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { sestSenatClient } from '../lib/httpClient'
import {
  SestSenatEmpresa,
  deduplicarPorFonteId,
  filtrarSomenteAbertos,
  normalizarRegistroSestSenat,
  parseSestSenatDadosAbertos,
} from '../services/sestSenatParser'
import { saveWorkerLog } from '../services/tenderService'
import { migrarFonteIdsLegadosSestSenat } from '../services/sestSenatMigracaoService'
import { salvarLote } from './coletorHtmlShared'

const EMPRESAS: SestSenatEmpresa[] = ['SEST', 'SENAT']

export function startColetorSestSenatWorker() {
  const worker = new Worker(
    'coletor-sest-senat',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let hadErrors = false

      try {
        const migracao = await migrarFonteIdsLegadosSestSenat()
        if (migracao.renomeados > 0 || migracao.conflitos > 0) {
          console.log(
            `[SEST SENAT Worker] Identificadores legados: ${migracao.renomeados} renomeado(s), ${migracao.conflitos} em conflito mantido(s).`
          )
        }

        const response = await sestSenatClient.post(
          '/edital/dadosAbertos',
          { filtro: { empresa: EMPRESAS } },
          { responseType: 'text', transformResponse: (data) => data }
        )
        const registros = parseSestSenatDadosAbertos(response.data as string)
        response.data = null
        const abertos = filtrarSomenteAbertos(registros)
        const tenders = deduplicarPorFonteId(abertos.map((r) => normalizarRegistroSestSenat(r)))
        totalFetched += tenders.length

        const result = await salvarLote(tenders, 'SEST SENAT Worker')
        totalNew += result.totalNew
        totalDupes += result.totalDupes
        totalUpdated += result.totalUpdated

        console.log(
          `[SEST SENAT Worker] ${registros.length} registro(s) na fonte, ${abertos.length} em aberto, ${tenders.length} licitação(ões) única(s).`
        )
      } catch (err) {
        hadErrors = true
        console.error('[SEST SENAT Worker] Erro na coleta:', err)
      }

      await saveWorkerLog({
        worker: 'coletor-sest-senat',
        status: hadErrors ? 'FAILED' : 'SUCCESS',
        fonte: 'SEST_SENAT',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'A coleta do SEST SENAT falhou — ver logs do worker' : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[SEST SENAT Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000, // 5min
      // 30min: medido em produção, o filtro por empresa às vezes devolve as
      // duas junto (ver aviso no parser) — pior caso é duas respostas de
      // ~300+ MB numa execução só, então a folga precisa ser generosa.
      lockDuration: 1_800_000,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[SEST SENAT Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
