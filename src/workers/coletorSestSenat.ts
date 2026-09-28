// ============================================================
// workers/coletorSestSenat.ts — Coleta SEST + SENAT (Sistema S nacional,
// não segue a Lei 14.133, não está garantido no PNCP).
//
// A API devolve o histórico nacional inteiro numa chamada só — não tem
// filtro de ano que funcione no servidor (testado à exaustão, ver
// sestSenatParser.ts). O corte pros últimos 2 anos é feito depois de
// baixar tudo; o custo de rede/parse por ciclo é maior que os outros
// coletores, mas o de escrita no banco não é — só entra o que passa
// no filtro, e o dedupe de sempre cuida do resto.
// ============================================================

import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { sestSenatClient } from '../lib/httpClient'
import {
  SestSenatEmpresa,
  filtrarRecentes,
  normalizarRegistroSestSenat,
  parseSestSenatDadosAbertos,
} from '../services/sestSenatParser'
import { saveWorkerLog } from '../services/tenderService'
import { salvarLote } from './coletorHtmlShared'

const ANOS_RECENTES = 2
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
          const recentes = filtrarRecentes(registros, ANOS_RECENTES)
          const tenders = recentes.map((r) => normalizarRegistroSestSenat(r, empresa))
          totalFetched += tenders.length

          const result = await salvarLote(tenders, `SEST SENAT Worker (${empresa})`)
          totalNew += result.totalNew
          totalDupes += result.totalDupes
          totalUpdated += result.totalUpdated

          console.log(
            `[SEST SENAT Worker] ${empresa}: ${registros.length} registro(s) na fonte, ${recentes.length} dentro do corte de ${ANOS_RECENTES} anos.`
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
      lockDuration: 900_000, // 15min — a resposta é grande (100+ MB), dá tempo de sobra
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[SEST SENAT Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
