import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { saveWorkerLog } from '../services/tenderService'
import { prepararRepublicacao } from '../services/queridoDiarioService'
import { existeNoQueridoDiario } from '../services/diarioMunicipalService'
import { existeNoPncpPelaRegraEstrita } from '../services/famemService'
import { baixarArquivoDoDomSc, listarArquivosDoMes } from '../services/domScService'
import { DependenciasDaColetaDomSc, coletarDomSc, memoriaDoDomScNoRedis, resumoDaColetaDomSc, statusDaColetaDomSc } from '../services/domScColeta'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'DOM/SC Worker'

export function dependenciasDoDomSc(): DependenciasDaColetaDomSc {
  return {
    listarArquivosDoMes,
    baixarArquivo: baixarArquivoDoDomSc,
    existeNoPncp: existeNoPncpPelaRegraEstrita,
    existeNoQueridoDiario,
    prepararRepublicacao,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    memoria: memoriaDoDomScNoRedis(redisConnection),
    agora: Date.now,
  }
}

export function startColetorDomScWorker() {
  const worker = new Worker(
    'coletor-dom-sc',
    async () => {
      const startedAt = new Date()
      const r = await coletarDomSc(dependenciasDoDomSc())
      const status = statusDaColetaDomSc(r)
      await saveWorkerLog({
        worker: 'coletor-dom-sc',
        status,
        fonte: 'DIARIO_MUNICIPAL',
        totalFetched: r.totalFetched,
        totalNew: r.totalNew,
        totalDupes: r.totalDupes + r.duplicadosDoPncp + r.duplicadosDoQueridoDiario,
        totalUpdated: r.totalUpdated,
        errorMsg: status === 'SUCCESS' ? undefined : `${r.falhasDeArquivo} arquivo(s) com falha — ver logs do worker`,
        startedAt,
        finishedAt: new Date(),
      })
      console.log(`[${CONTEXTO}] Concluído — ${resumoDaColetaDomSc(r)}`)
    },
    { connection: redisConnection, concurrency: 1, stalledInterval: 300_000, lockDuration: 1_800_000 }
  )
  worker.on('failed', (job, err) => {
    console.error(`[${CONTEXTO}] Job ${job?.id} falhou:`, err.message)
  })
  return worker
}
