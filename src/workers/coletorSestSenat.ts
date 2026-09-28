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
  filtrarSomenteAbertos,
  normalizarRegistroSestSenat,
  parseSestSenatDadosAbertos,
} from '../services/sestSenatParser'
import { saveWorkerLog } from '../services/tenderService'
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

      for (const empresa of EMPRESAS) {
        try {
          const response = await sestSenatClient.post(
            '/edital/dadosAbertos',
            { filtro: { empresa: [empresa] } },
            { responseType: 'text', transformResponse: (data) => data }
          )
          const registros = parseSestSenatDadosAbertos(response.data as string)
          const abertos = filtrarSomenteAbertos(registros)
          // normalizarRegistroSestSenat não usa `empresa` (o filtro do
          // servidor é inconsistente — ver aviso em sestSenatParser.ts):
          // cada registro se rotula sozinho pelo próprio campo `empresa`.
          const tenders = abertos.map((r) => normalizarRegistroSestSenat(r))
          totalFetched += tenders.length

          const result = await salvarLote(tenders, `SEST SENAT Worker (${empresa})`)
          totalNew += result.totalNew
          totalDupes += result.totalDupes
          totalUpdated += result.totalUpdated

          console.log(
            `[SEST SENAT Worker] ${empresa}: ${registros.length} registro(s) na fonte, ${abertos.length} em aberto.`
          )
        } catch (err) {
          hadErrors = true
          console.error(`[SEST SENAT Worker] Erro na coleta de ${empresa}:`, err)
        }
      }

      await saveWorkerLog({
        worker: 'coletor-sest-senat',
        status: hadErrors ? 'PARTIAL' : 'SUCCESS',
        fonte: 'SEST_SENAT',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors ? 'Uma ou mais empresas (SEST/SENAT) falharam — ver logs do worker' : undefined,
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
