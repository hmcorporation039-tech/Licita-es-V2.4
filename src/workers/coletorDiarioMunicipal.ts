import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { saveWorkerLog } from '../services/tenderService'
import { existeNoPncp, prepararRepublicacao } from '../services/queridoDiarioService'
import {
  baixarMateria,
  buscarMaterias,
  existeNoQueridoDiario,
  janelaDoDiarioMunicipal,
} from '../services/diarioMunicipalService'
import {
  DependenciasDaColeta,
  coletarDiarioMunicipal,
  descricaoDaParada,
  memoriaDeMateriasNoRedis,
  resumoDaAssociacao,
  resumoPorUf,
} from '../services/diarioMunicipalColeta'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'Diário Municipal Worker'

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dependenciasDaColeta(): DependenciasDaColeta {
  return {
    buscar: buscarMaterias,
    baixarMateria,
    existeNoPncp,
    existeNoQueridoDiario,
    prepararRepublicacao,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    memoria: memoriaDeMateriasNoRedis(redisConnection),
    esperar,
    agora: Date.now,
  }
}

export function startColetorDiarioMunicipalWorker() {
  const worker = new Worker(
    'coletor-diario-municipal',
    async () => {
      const startedAt = new Date()
      const janela = janelaDoDiarioMunicipal(startedAt)
      const r = await coletarDiarioMunicipal(dependenciasDaColeta(), janela)

      const parada = descricaoDaParada(r)
      const status = r.houveFalhas ? (r.materiasLidas === 0 && r.jaLidasAntes === 0 ? 'FAILED' : 'PARTIAL') : 'SUCCESS'
      const falhas = r.houveFalhas
        ? `Coleta parcial: ${r.falhasDeLeitura} matéria(s) sem leitura, ${r.falhasDeBusca} busca(s) com falha${parada ? `; ${parada}` : ''} — ver logs do worker`
        : undefined

      await saveWorkerLog({
        worker: 'coletor-diario-municipal',
        status,
        fonte: 'DIARIO_MUNICIPAL',
        totalFetched: r.totalFetched,
        totalNew: r.totalNew,
        totalDupes: r.totalDupes,
        totalUpdated: r.totalUpdated,
        errorMsg: falhas,
        startedAt,
        finishedAt: new Date(),
      })

      for (const medicao of r.porAssociacao) console.log(`[${CONTEXTO}] ${resumoDaAssociacao(medicao)}`)
      console.log(`[${CONTEXTO}] Por UF — ${resumoPorUf(r)}`)
      console.log(
        `[${CONTEXTO}] Concluído (${janela.dataInicio} a ${janela.dataFim}) — requisições: ${r.requisicoes}, buscas: ${r.buscas}, ` +
          `matérias lidas: ${r.materiasLidas}, já lidas antes: ${r.jaLidasAntes}, avisos: ${r.avisos}, ` +
          `já no PNCP pelo identificador: ${r.descartadosPorPncp}, já no PNCP pela comparação: ${r.duplicadosDoPncp}, ` +
          `já no Querido Diário: ${r.duplicadosDoQueridoDiario}, novos: ${r.totalNew}, atualizados: ${r.totalUpdated}, ` +
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
