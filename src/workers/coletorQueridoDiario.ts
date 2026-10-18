import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { saveWorkerLog } from '../services/tenderService'
import { ultimaPublicacaoColetada } from '../services/coletaCursorService'
import {
  baixarTextoDoDiario,
  buscarCidadesDoQueridoDiario,
  buscarDiarios,
  existeNoPncp,
  janelaDoQueridoDiario,
  prepararRepublicacao,
} from '../services/queridoDiarioService'
import {
  DependenciasDaColeta,
  coletarQueridoDiario,
  descricaoDaParada,
  desfechoDaColeta,
  memoriaDeDiariosNoRedis,
  resumoDaUf,
} from '../services/queridoDiarioColeta'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'Querido Diário Worker'

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dependenciasDaColeta(): DependenciasDaColeta {
  return {
    buscarCidades: buscarCidadesDoQueridoDiario,
    buscarDiarios,
    baixarTexto: baixarTextoDoDiario,
    existeNoPncp,
    prepararRepublicacao,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    memoria: memoriaDeDiariosNoRedis(redisConnection),
    esperar,
    agora: Date.now,
  }
}

export function startColetorQueridoDiarioWorker() {
  const worker = new Worker(
    'coletor-querido-diario',
    async () => {
      const startedAt = new Date()
      const janela = janelaDoQueridoDiario(startedAt, await ultimaPublicacaoColetada('QUERIDO_DIARIO'))
      const r = await coletarQueridoDiario(dependenciasDaColeta(), janela)

      const parada = descricaoDaParada(r)
      const { status, mensagem } = desfechoDaColeta(r)

      await saveWorkerLog({
        worker: 'coletor-querido-diario',
        status,
        fonte: 'QUERIDO_DIARIO',
        totalFetched: r.totalFetched,
        totalNew: r.totalNew,
        totalDupes: r.totalDupes,
        totalUpdated: r.totalUpdated,
        errorMsg: mensagem,
        startedAt,
        finishedAt: new Date(),
      })

      for (const medicao of r.porUf) console.log(`[${CONTEXTO}] ${resumoDaUf(medicao)}`)
      console.log(
        `[${CONTEXTO}] Concluído (${janela.publicadoDesde} a ${janela.publicadoAte}) — buscas: ${r.buscas}, diários lidos: ${r.diariosLidos}, ` +
          `já lidos antes: ${r.jaLidosAntes}, avisos: ${r.avisos}, já no PNCP pelo identificador: ${r.descartadosPorPncp}, ` +
          `já no PNCP pela comparação: ${r.duplicadosDoPncp}, novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
          `inalterados: ${r.totalDupes - r.totalUpdated}${parada ? ` — ${parada}` : ''}${r.houveFalhas ? ' (com falhas parciais)' : ''}`
      )
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000,
      lockDuration: 3_600_000,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[${CONTEXTO}] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
