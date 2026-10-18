import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { saveWorkerLog } from '../services/tenderService'
import { prepararRepublicacao } from '../services/queridoDiarioService'
import { existeNoQueridoDiario } from '../services/diarioMunicipalService'
import { abrirSessaoDaFamem, baixarListaDaFamem, baixarPublicacaoDaFamem, existeNoPncpPelaRegraEstrita } from '../services/famemService'
import {
  DependenciasDaColetaFamem,
  LIMITES_PADRAO_FAMEM,
  LimitesDaColetaFamem,
  RedeDaFamem,
  ResultadoDaColetaFamem,
  coletarDaFamem,
  descricaoDaParadaFamem,
  memoriaDaFamemNoRedis,
  resumoDaColetaFamem,
  statusDaColetaFamem,
} from '../services/famemColeta'
import { MemoriaDeDiarios } from '../services/queridoDiarioColeta'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'FAMEM Worker'

export const REDE_DA_FAMEM: RedeDaFamem = {
  abrirSessao: abrirSessaoDaFamem,
  baixarLista: baixarListaDaFamem,
  baixarPublicacao: baixarPublicacaoDaFamem,
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function dependenciasDaFamem(
  rede: RedeDaFamem = REDE_DA_FAMEM,
  memoria: MemoriaDeDiarios = memoriaDaFamemNoRedis(redisConnection),
  relogio: () => number = Date.now,
  pausa: (ms: number) => Promise<void> = esperar
): DependenciasDaColetaFamem {
  return {
    rede,
    existeNoPncp: existeNoPncpPelaRegraEstrita,
    existeNoQueridoDiario,
    prepararRepublicacao,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    memoria,
    esperar: pausa,
    agora: relogio,
  }
}

export async function coletarFamem(
  dep: DependenciasDaColetaFamem = dependenciasDaFamem(),
  limites: LimitesDaColetaFamem = LIMITES_PADRAO_FAMEM
): Promise<ResultadoDaColetaFamem> {
  return coletarDaFamem(dep, limites)
}

export function startColetorFamemWorker() {
  const worker = new Worker(
    'coletor-famem',
    async () => {
      const startedAt = new Date()
      const r = await coletarFamem()
      const parada = descricaoDaParadaFamem(r)
      const status = statusDaColetaFamem(r)

      await saveWorkerLog({
        worker: 'coletor-famem',
        status,
        fonte: 'FAMEM',
        totalFetched: r.totalFetched,
        totalNew: r.totalNew,
        totalDupes: r.totalDupes + r.duplicadosDoPncp + r.duplicadosDoQueridoDiario + r.descartadosPorPncpNoTexto + r.jaLidasAntes,
        totalUpdated: r.totalUpdated,
        errorMsg: status === 'SUCCESS' ? undefined : `${parada ?? 'coleta parcial'}; ${r.falhasDeLeitura} publicação(ões) sem leitura — ver logs do worker`,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(`[${CONTEXTO}] Concluído — ${resumoDaColetaFamem(r)}${parada ? ` — ${parada}` : ''}`)
    },
    {
      connection: redisConnection,
      concurrency: 1,
      stalledInterval: 300_000,
      lockDuration: 1_800_000,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[${CONTEXTO}] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
