import { Worker } from 'bullmq'
import { matcherQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma, saveWorkerLog } from '../services/tenderService'
import { duplicidadeNoPncpTceRs } from '../services/tceRsDuplicidade'
import {
  DependenciasDaColetaTceRs,
  LIMITES_PADRAO_TCE_RS,
  LimitesDaColetaTceRs,
  REDE_DO_TCE_RS,
  RedeDoTceRs,
  RegistroDoTceRs,
  ResumoDaColetaTceRs,
  coletarTceRs,
  duplicadasNoPncp,
  linhaDoResumo,
} from '../services/tceRsColeta'
import { motivoCurto } from '../services/infraeroVarredura'
import { SituacaoEnum } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'TCE-RS Worker'

async function registrosDoTceRs(): Promise<RegistroDoTceRs[]> {
  return prisma.$queryRaw<RegistroDoTceRs[]>`
    SELECT id,
           fonte_id AS "fonteId",
           situacao::text AS situacao,
           abertura_at AS "aberturaAt",
           raw_json->'anexos' AS anexos
    FROM tenders
    WHERE fonte = 'TCE_RS'
  `
}

async function atualizarSituacao(registro: RegistroDoTceRs, situacao: SituacaoEnum, agora: Date): Promise<void> {
  await prisma.tender.update({ where: { id: registro.id }, data: { situacao, situacaoCheckedAt: agora } })
  if (situacao === 'ABERTA') await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: registro.id }, CONTEXTO)
}

export function dependenciasDoTceRs(rede: RedeDoTceRs = REDE_DO_TCE_RS): DependenciasDaColetaTceRs {
  return {
    rede,
    registrosSalvos: registrosDoTceRs,
    duplicidadeNoPncp: duplicidadeNoPncpTceRs,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    atualizarSituacao,
  }
}

export async function coletarDoTceRs(
  rede: RedeDoTceRs = REDE_DO_TCE_RS,
  agora = new Date(),
  limites: LimitesDaColetaTceRs = LIMITES_PADRAO_TCE_RS
): Promise<ResumoDaColetaTceRs> {
  return coletarTceRs(dependenciasDoTceRs(rede), agora, limites)
}

export function statusDaColetaTceRs(resumo: ResumoDaColetaTceRs | null, erroGeral: string | null): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (erroGeral || !resumo || resumo.linhasLidas === 0) return 'FAILED'
  if (resumo.bloqueado || resumo.falhas.length > 0 || !resumo.arquivosCompletos) return 'PARTIAL'
  return 'SUCCESS'
}

export function startColetorTceRsWorker() {
  const worker = new Worker(
    'coletor-tce-rs',
    async () => {
      const startedAt = new Date()
      let resumo: ResumoDaColetaTceRs | null = null
      let erroGeral: string | null = null

      try {
        resumo = await coletarDoTceRs(REDE_DO_TCE_RS, startedAt)
      } catch (err) {
        erroGeral = motivoCurto(err)
        console.error(`[${CONTEXTO}] Erro na coleta:`, err instanceof Error ? err.message : err)
      }

      const falhas = resumo?.falhas ?? []
      await saveWorkerLog({
        worker: 'coletor-tce-rs',
        status: statusDaColetaTceRs(resumo, erroGeral),
        fonte: 'TCE_RS',
        totalFetched: resumo?.candidatas ?? 0,
        totalNew: resumo?.totalNew ?? 0,
        totalDupes: (resumo?.totalDupes ?? 0) + (resumo ? duplicadasNoPncp(resumo) : 0),
        totalUpdated: resumo?.totalUpdated ?? 0,
        errorMsg: erroGeral ?? (falhas.length > 0 ? `Falhas: ${falhas.slice(0, 20).join(', ')}` : undefined),
        startedAt,
        finishedAt: new Date(),
      })

      if (resumo) console.log(`[${CONTEXTO}] Concluído — ${linhaDoResumo(resumo)}`)
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
