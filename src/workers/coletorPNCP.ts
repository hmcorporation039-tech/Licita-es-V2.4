// ============================================================
// workers/coletorPNCP.ts — Coleta licitações do PNCP
// API: https://pncp.gov.br/api/consulta/swagger-ui/index.html
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection, matcherQueue } from '../queues'
import { pncpClient } from '../lib/httpClient'
import { parsePNCPTender } from '../services/pncpParser'
import { saveTender, saveWorkerLog } from '../services/tenderService'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { resolveColetaWindow } from '../lib/coletaWindow'
import { ultimaPublicacaoColetada } from '../services/coletaCursorService'
import { avisarAlteracaoDeTender } from '../services/tenderChangeService'
import { ColetorJobPayload } from '../types'

// Todos os códigos de modalidade do PNCP (1 a 13, ver PNCP_MODALIDADE_MAP em types/index.ts)
const MODALIDADES_ALVO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

const ITEMS_PER_PAGE = 50

async function fetchPNCPPage(
  dataInicial: string,
  dataFinal: string,
  modalidade: number,
  pagina: number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[]; totalPages: number }> {
  const response = await pncpClient.get('/v1/contratacoes/publicacao', {
    params: {
      dataInicial: dataInicial.replace(/-/g, ''),  // formato AAAAMMDD
      dataFinal: dataFinal.replace(/-/g, ''),
      codigoModalidadeContratacao: modalidade,
      pagina,
      tamanhoPagina: ITEMS_PER_PAGE,
    },
  })

  const body = response.data
  // PNCP retorna: { data: [], totalRegistros, totalPaginas, paginaAtual }
  return {
    data: body.data ?? body ?? [],
    totalPages: body.totalPaginas ?? 1,
  }
}

// Worker principal
export function startColetorPNCPWorker() {
  const worker = new Worker<ColetorJobPayload>(
    'coletor-pncp',
    async (job: Job<ColetorJobPayload>) => {
      const { dataInicial, dataFinal } = resolveColetaWindow(job.data, {
        ultimaPublicacaoColetada: await ultimaPublicacaoColetada('PNCP'),
      })
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0

      console.log(`[PNCP Worker] Iniciando coleta ${dataInicial} → ${dataFinal}`)

      try {
        let hadModalidadeErrors = false

        for (const modalidade of MODALIDADES_ALVO) {
          // Cada modalidade é isolada: se uma falhar (ex: 400/502 pontual),
          // as demais continuam sendo coletadas em vez de abortar o job inteiro.
          try {
            let pagina = 1
            let totalPages = 1

            while (pagina <= totalPages) {
              await job.updateProgress(Math.round((pagina / (totalPages || 1)) * 100))

              const { data, totalPages: tp } = await fetchPNCPPage(
                dataInicial,
                dataFinal,
                modalidade,
                pagina
              )

              totalPages = tp
              totalFetched += data.length

              for (const rawTender of data) {
                try {
                  const normalized = parsePNCPTender(rawTender)
                  const result = await saveTender(normalized)

                  if (result.isNew) {
                    totalNew++
                    // Dispara matcher para cada nova licitação
                    await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: result.tenderId }, 'PNCP Worker')
                  } else {
                    totalDupes++
                    if (result.changed) {
                      totalUpdated++
                      await avisarAlteracaoDeTender(result.tenderId, result.changedFields)
                    }
                  }
                } catch (itemErr) {
                  console.error('[PNCP Worker] Erro ao processar item:', itemErr)
                }
              }

              pagina++
            }
          } catch (modalidadeErr) {
            hadModalidadeErrors = true
            const msg = modalidadeErr instanceof Error ? modalidadeErr.message : String(modalidadeErr)
            console.error(`[PNCP Worker] Erro na modalidade ${modalidade}, pulando para a próxima:`, msg)
          }
        }

        await saveWorkerLog({
          worker: 'coletor-pncp',
          status: hadModalidadeErrors ? 'PARTIAL' : 'SUCCESS',
          fonte: 'PNCP',
          totalFetched,
          totalNew,
          totalDupes,
          totalUpdated,
          errorMsg: hadModalidadeErrors ? 'Uma ou mais modalidades falharam — ver logs do worker' : undefined,
          startedAt,
          finishedAt: new Date(),
        })

        console.log(
          `[PNCP Worker] Concluído — coletados: ${totalFetched}, novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadModalidadeErrors ? ' (com falhas parciais)' : ''}`
        )
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        await saveWorkerLog({
          worker: 'coletor-pncp',
          status: 'FAILED',
          fonte: 'PNCP',
          totalFetched,
          totalNew,
          totalDupes,
          totalUpdated,
          errorMsg,
          startedAt,
          finishedAt: new Date(),
        })
        throw err // BullMQ vai fazer retry automaticamente
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Uma coleta PNCP por vez (respeitar rate limit)
      // Jobs de coleta são longos (várias páginas, 1 req/1.2s) e o worker fica a
      // maior parte do tempo ocioso entre ciclos — o padrão do BullMQ (checar
      // jobs travados a cada 30s) gasta requisições demais no Redis à toa; ver
      // README sobre o limite do plano gratuito do Upstash.
      stalledInterval: 300_000, // 5min
      lockDuration: 600_000, // 10min — cobre uma coleta paginada inteira
    }
  )

  worker.on('completed', (job) => {
    console.log(`[PNCP Worker] Job ${job.id} concluído.`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[PNCP Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
