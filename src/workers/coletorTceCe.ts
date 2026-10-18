import { Worker } from 'bullmq'
import { matcherQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma, saveWorkerLog } from '../services/tenderService'
import { duplicidadeNoPncpTceCe } from '../services/tceCeDuplicidade'
import { idDaLicitacaoTceCe } from '../services/tceCeParser'
import {
  DependenciasDaColetaTceCe,
  LIMITES_PADRAO_TCE_CE,
  LimitesDaColetaTceCe,
  REDE_DO_TCE_CE,
  RedeDoTceCe,
  RegistroDoTceCe,
  ResumoDaColetaTceCe,
  coletarTceCe,
  linhaDoResumo,
} from '../services/tceCeColeta'
import { motivoCurto } from '../services/infraeroVarredura'
import { SituacaoEnum } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'TCE-CE Worker'

interface LinhaDoRegistro {
  id: string
  fonteId: string
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  idProcesso: string | null
  assinatura: string | null
}

async function registrosDoTceCe(): Promise<RegistroDoTceCe[]> {
  const linhas = await prisma.$queryRaw<LinhaDoRegistro[]>`
    SELECT id,
           fonte_id AS "fonteId",
           situacao::text AS situacao,
           abertura_at AS "aberturaAt",
           coalesce(situacao_checked_at, created_at) AS "conferidaEm",
           raw_json->>'idProcesso' AS "idProcesso",
           raw_json->>'assinaturaDaLista' AS assinatura
    FROM tenders
    WHERE fonte = 'TCE_CE'
  `
  return linhas.flatMap((l) => {
    const idLicitacao = idDaLicitacaoTceCe(l.fonteId)
    if (idLicitacao === undefined) return []
    const idProcesso = Number(l.idProcesso)
    return [
      {
        id: l.id,
        idLicitacao,
        idProcesso: Number.isSafeInteger(idProcesso) && idProcesso > 0 ? idProcesso : null,
        situacao: l.situacao,
        aberturaAt: l.aberturaAt,
        conferidaEm: l.conferidaEm,
        assinaturaDaLista: l.assinatura,
      },
    ]
  })
}

async function atualizarSituacao(registro: RegistroDoTceCe, situacao: SituacaoEnum, agora: Date): Promise<void> {
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

export function dependenciasDoTceCe(rede: RedeDoTceCe = REDE_DO_TCE_CE): DependenciasDaColetaTceCe {
  return {
    rede,
    registrosSalvos: registrosDoTceCe,
    duplicidadeNoPncp: duplicidadeNoPncpTceCe,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    atualizarSituacao,
    registrarConferencia,
  }
}

export async function coletarDoTceCe(
  rede: RedeDoTceCe = REDE_DO_TCE_CE,
  agora = new Date(),
  limites: LimitesDaColetaTceCe = LIMITES_PADRAO_TCE_CE
): Promise<ResumoDaColetaTceCe> {
  return coletarTceCe(dependenciasDoTceCe(rede), agora, limites)
}

function statusDaColeta(resumo: ResumoDaColetaTceCe | null, erroGeral: string | null): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (erroGeral || !resumo || resumo.paginas === 0) return 'FAILED'
  if (resumo.bloqueado || resumo.falhas.length > 0 || !resumo.listaCompleta || resumo.adiadasPeloLimite > 0) return 'PARTIAL'
  return 'SUCCESS'
}

export function startColetorTceCeWorker() {
  const worker = new Worker(
    'coletor-tce-ce',
    async () => {
      const startedAt = new Date()
      let resumo: ResumoDaColetaTceCe | null = null
      let erroGeral: string | null = null

      try {
        resumo = await coletarDoTceCe(REDE_DO_TCE_CE, startedAt)
      } catch (err) {
        erroGeral = motivoCurto(err)
        console.error(`[${CONTEXTO}] Erro na coleta:`, err instanceof Error ? err.message : err)
      }

      const falhas = resumo?.falhas ?? []
      await saveWorkerLog({
        worker: 'coletor-tce-ce',
        status: statusDaColeta(resumo, erroGeral),
        fonte: 'TCE_CE',
        totalFetched: resumo ? resumo.novasForaDoPncp + resumo.revisitadas : 0,
        totalNew: resumo?.totalNew ?? 0,
        totalDupes: (resumo?.totalDupes ?? 0) + (resumo ? resumo.duplicadasPncpPorObjeto + resumo.duplicadasPncpPorNumero : 0),
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
