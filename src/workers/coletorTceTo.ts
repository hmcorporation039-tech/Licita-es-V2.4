import { Worker } from 'bullmq'
import { matcherQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma, saveWorkerLog } from '../services/tenderService'
import { duplicidadeNoPncpTceCe } from '../services/tceCeDuplicidade'
import { idDoProcedimentoTceTo } from '../services/tceToParser'
import {
  DependenciasDaColetaTceTo,
  LIMITES_PADRAO_TCE_TO,
  LimitesDaColetaTceTo,
  REDE_DO_TCE_TO,
  RedeDoTceTo,
  RegistroDoTceTo,
  ResumoDaColetaTceTo,
  coletarTceTo,
  linhaDoResumoTceTo,
  memoriaDoTceToNoRedis,
} from '../services/tceToColeta'
import { MemoriaDeDiarios } from '../services/queridoDiarioColeta'
import { motivoCurto } from '../services/infraeroVarredura'
import { SituacaoEnum } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'TCE-TO Worker'

interface LinhaDoRegistro {
  id: string
  fonteId: string
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  assinatura: string | null
}

async function registrosDoTceTo(): Promise<RegistroDoTceTo[]> {
  const linhas = await prisma.$queryRaw<LinhaDoRegistro[]>`
    SELECT id,
           fonte_id AS "fonteId",
           situacao::text AS situacao,
           abertura_at AS "aberturaAt",
           coalesce(situacao_checked_at, created_at) AS "conferidaEm",
           raw_json->>'assinaturaDaLista' AS assinatura
    FROM tenders
    WHERE fonte = 'TCE_TO'
  `
  return linhas.flatMap((l) => {
    const idProcedimento = idDoProcedimentoTceTo(l.fonteId)
    if (idProcedimento === undefined) return []
    return [{ id: l.id, idProcedimento, situacao: l.situacao, aberturaAt: l.aberturaAt, conferidaEm: l.conferidaEm, assinaturaDaLista: l.assinatura }]
  })
}

async function atualizarSituacao(registro: RegistroDoTceTo, situacao: SituacaoEnum, agora: Date): Promise<void> {
  await prisma.tender.update({ where: { id: registro.id }, data: { situacao, situacaoCheckedAt: agora } })
  if (situacao === 'ABERTA') await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: registro.id }, CONTEXTO)
}

async function registrarConferencia(registroId: string, agora: Date, assinaturaDaLista: string | null): Promise<void> {
  if (assinaturaDaLista === null) {
    await prisma.tender.update({ where: { id: registroId }, data: { situacaoCheckedAt: agora } })
    return
  }
  await prisma.$executeRaw`
    UPDATE tenders
    SET situacao_checked_at = ${agora},
        raw_json = jsonb_set(raw_json, '{assinaturaDaLista}', to_jsonb(${assinaturaDaLista}::text))
    WHERE id = ${registroId}
  `
}

export function dependenciasDoTceTo(rede: RedeDoTceTo = REDE_DO_TCE_TO, memoria: MemoriaDeDiarios = memoriaDoTceToNoRedis(redisConnection)): DependenciasDaColetaTceTo {
  return {
    rede,
    memoria,
    registrosSalvos: registrosDoTceTo,
    duplicidadeNoPncp: duplicidadeNoPncpTceCe,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    atualizarSituacao,
    registrarConferencia,
    relogio: Date.now,
  }
}

export async function coletarDoTceTo(
  rede: RedeDoTceTo = REDE_DO_TCE_TO,
  agora = new Date(),
  limites: LimitesDaColetaTceTo = LIMITES_PADRAO_TCE_TO,
  memoria?: MemoriaDeDiarios
): Promise<ResumoDaColetaTceTo> {
  return coletarTceTo(dependenciasDoTceTo(rede, memoria), agora, limites)
}

function statusDaColeta(resumo: ResumoDaColetaTceTo | null, erroGeral: string | null): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (erroGeral || !resumo || resumo.paginas === 0) return 'FAILED'
  if (resumo.bloqueado || resumo.falhas.length > 0 || !resumo.listaCompleta || resumo.adiadasPeloLimite > 0) return 'PARTIAL'
  return 'SUCCESS'
}

export function startColetorTceToWorker() {
  const worker = new Worker(
    'coletor-tce-to',
    async () => {
      const startedAt = new Date()
      let resumo: ResumoDaColetaTceTo | null = null
      let erroGeral: string | null = null

      try {
        resumo = await coletarDoTceTo(REDE_DO_TCE_TO, startedAt)
      } catch (err) {
        erroGeral = motivoCurto(err)
        console.error(`[${CONTEXTO}] Erro na coleta:`, err instanceof Error ? err.message : err)
      }

      const falhas = resumo?.falhas ?? []
      await saveWorkerLog({
        worker: 'coletor-tce-to',
        status: statusDaColeta(resumo, erroGeral),
        fonte: 'TCE_TO',
        totalFetched: resumo ? resumo.novasForaDoPncp + resumo.revisitadas : 0,
        totalNew: resumo?.totalNew ?? 0,
        totalDupes: (resumo?.totalDupes ?? 0) + (resumo ? resumo.duplicadasPncpPorObjeto + resumo.duplicadasPncpPorNumero : 0),
        totalUpdated: resumo?.totalUpdated ?? 0,
        errorMsg: erroGeral ?? (falhas.length > 0 ? `Falhas: ${falhas.slice(0, 20).join(', ')}` : undefined),
        startedAt,
        finishedAt: new Date(),
      })

      if (resumo) console.log(`[${CONTEXTO}] Concluído — ${linhaDoResumoTceTo(resumo)}`)
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
