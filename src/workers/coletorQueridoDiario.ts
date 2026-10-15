import { Worker } from 'bullmq'
import { redisConnection } from '../queues'
import { saveWorkerLog } from '../services/tenderService'
import { ultimaPublicacaoColetada } from '../services/coletaCursorService'
import { parseDiarioOficial } from '../services/queridoDiarioParser'
import {
  MAXIMO_DE_PAGINAS,
  PaginaDoQueridoDiario,
  TAMANHO_DA_PAGINA,
  baixarTextoDoDiario,
  buscarDiarios,
  existeNoPncp,
  janelaDoQueridoDiario,
  prepararRepublicacao,
} from '../services/queridoDiarioService'
import { NormalizedTender } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'Querido Diário Worker'

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function startColetorQueridoDiarioWorker() {
  const worker = new Worker(
    'coletor-querido-diario',
    async () => {
      const startedAt = new Date()
      let totalFetched = 0
      let totalNew = 0
      let totalDupes = 0
      let totalUpdated = 0
      let diariosLidos = 0
      let avisosValidos = 0
      let descartadosPorPncp = 0
      let duplicadosDoPncp = 0
      let falhasDeTexto = 0
      let hadErrors = false

      const janela = janelaDoQueridoDiario(startedAt, await ultimaPublicacaoColetada('QUERIDO_DIARIO'))
      const textosVistos = new Set<string>()

      for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
        let resposta: PaginaDoQueridoDiario
        try {
          resposta = await buscarDiarios(janela, pagina * TAMANHO_DA_PAGINA)
        } catch (err) {
          hadErrors = true
          console.error(`[${CONTEXTO}] Erro na busca (página ${pagina + 1}):`, mensagemDoErro(err))
          break
        }

        for (const gazeta of resposta.gazettes ?? []) {
          if (!gazeta.txt_url || textosVistos.has(gazeta.txt_url)) continue
          textosVistos.add(gazeta.txt_url)

          let texto: string
          try {
            texto = await baixarTextoDoDiario(gazeta.txt_url)
          } catch (err) {
            falhasDeTexto++
            console.warn(`[${CONTEXTO}] Texto indisponível (${gazeta.territory_name}/${gazeta.state_code} ${gazeta.date}):`, mensagemDoErro(err))
            continue
          }
          diariosLidos++

          const resultado = parseDiarioOficial(gazeta, texto, startedAt)
          avisosValidos += resultado.tenders.length + resultado.descartadosPorPncp
          descartadosPorPncp += resultado.descartadosPorPncp

          const lote: NormalizedTender[] = []
          for (const tender of resultado.tenders) {
            try {
              if (await existeNoPncp(tender, startedAt)) {
                duplicadosDoPncp++
                continue
              }
              const ajustado = await prepararRepublicacao(tender)
              if (ajustado) lote.push(ajustado)
              else totalDupes++
            } catch (err) {
              hadErrors = true
              console.error(`[${CONTEXTO}] Erro ao conferir ${tender.fonteId}:`, mensagemDoErro(err))
            }
          }

          totalFetched += lote.length
          const salvos = await salvarLote(lote, CONTEXTO)
          totalNew += salvos.totalNew
          totalDupes += salvos.totalDupes
          totalUpdated += salvos.totalUpdated
        }

        const lidosAteAqui = (pagina + 1) * TAMANHO_DA_PAGINA
        if ((resposta.gazettes ?? []).length < TAMANHO_DA_PAGINA || lidosAteAqui >= resposta.total_gazettes) break
      }

      if (falhasDeTexto > 0) hadErrors = true
      const status = hadErrors ? (diariosLidos === 0 ? 'FAILED' : 'PARTIAL') : 'SUCCESS'

      await saveWorkerLog({
        worker: 'coletor-querido-diario',
        status,
        fonte: 'QUERIDO_DIARIO',
        totalFetched,
        totalNew,
        totalDupes,
        totalUpdated,
        errorMsg: hadErrors
          ? `Coleta parcial: ${falhasDeTexto} diário(s) sem texto ou falha na busca — ver logs do worker`
          : undefined,
        startedAt,
        finishedAt: new Date(),
      })

      console.log(
        `[${CONTEXTO}] Concluído (${janela.publicadoDesde} a ${janela.publicadoAte}) — diários lidos: ${diariosLidos}, avisos: ${avisosValidos}, ` +
          `já no PNCP pelo identificador: ${descartadosPorPncp}, já no PNCP pela comparação: ${duplicadosDoPncp}, ` +
          `novos: ${totalNew}, atualizados: ${totalUpdated}, inalterados: ${totalDupes - totalUpdated}${hadErrors ? ' (com falhas parciais)' : ''}`
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
