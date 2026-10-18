import { Worker } from 'bullmq'
import { matcherQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma, saveTender, saveWorkerLog } from '../services/tenderService'
import { duplicataNoPncpTcePi, gemeaPublicadaNoPncpTcePi } from '../services/tcePiDuplicidade'
import { idNoMuralTcePi } from '../services/tcePiParser'
import {
  DependenciasDaColetaTcePi,
  LIMITES_PADRAO_TCE_PI,
  LimitesDaColetaTcePi,
  REDE_DO_TCE_PI,
  RedeDoTcePi,
  RegistroDoTcePi,
  ResumoDaColetaTcePi,
  coletarTcePi,
  linhaDoResumoTcePi,
} from '../services/tcePiColeta'
import { motivoCurto } from '../services/infraeroVarredura'
import { NormalizedTender, SituacaoEnum } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'TCE-PI Worker'

interface LinhaDoRegistro {
  id: string
  fonteId: string
  situacao: SituacaoEnum
  aberturaAt: Date | null
  conferidaEm: Date | null
  assinatura: string | null
  publicadoNoPncp: string | null
  oculta: boolean
}

async function registrosDoTcePi(): Promise<RegistroDoTcePi[]> {
  const linhas = await prisma.$queryRaw<LinhaDoRegistro[]>`
    SELECT id,
           fonte_id AS "fonteId",
           situacao::text AS situacao,
           abertura_at AS "aberturaAt",
           coalesce(situacao_checked_at, created_at) AS "conferidaEm",
           raw_json->>'assinaturaDaLista' AS assinatura,
           raw_json->>'publicadoNoPncp' AS "publicadoNoPncp",
           (motivo_oculta IS NOT NULL OR duplicata_de IS NOT NULL) AS oculta
    FROM tenders
    WHERE fonte = 'TCE_PI'
  `
  return linhas.flatMap((l) => {
    const idNoMural = idNoMuralTcePi(l.fonteId)
    if (idNoMural === undefined) return []
    return [
      {
        id: l.id,
        idNoMural,
        situacao: l.situacao,
        aberturaAt: l.aberturaAt,
        conferidaEm: l.conferidaEm,
        assinaturaDaLista: l.assinatura,
        publicadoNoPncp: l.publicadoNoPncp === 'true' ? true : l.publicadoNoPncp === 'false' ? false : null,
        oculta: l.oculta,
      },
    ]
  })
}

async function atualizarSituacao(registro: RegistroDoTcePi, situacao: SituacaoEnum, agora: Date): Promise<void> {
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

async function guardarOcultas(lote: NormalizedTender[], motivo: string): Promise<void> {
  for (const tender of lote) {
    try {
      const { tenderId } = await saveTender(tender)
      await prisma.tender.update({ where: { id: tenderId }, data: { motivoOculta: motivo } })
    } catch (err) {
      console.error(`[${CONTEXTO}] Erro ao guardar licitação repetida do PNCP:`, err instanceof Error ? err.message : err)
    }
  }
}

export function dependenciasDoTcePi(rede: RedeDoTcePi = REDE_DO_TCE_PI): DependenciasDaColetaTcePi {
  return {
    rede,
    registrosSalvos: registrosDoTcePi,
    duplicataNoPncp: duplicataNoPncpTcePi,
    gemeaPublicadaNoPncp: gemeaPublicadaNoPncpTcePi,
    salvarLote: (lote) => salvarLote(lote, CONTEXTO),
    guardarOcultas,
    atualizarSituacao,
    registrarConferencia,
  }
}

export async function coletarDoTcePi(
  rede: RedeDoTcePi = REDE_DO_TCE_PI,
  agora = new Date(),
  limites: LimitesDaColetaTcePi = LIMITES_PADRAO_TCE_PI
): Promise<ResumoDaColetaTcePi> {
  return coletarTcePi(dependenciasDoTcePi(rede), agora, limites)
}

export function statusDaColetaTcePi(resumo: ResumoDaColetaTcePi | null, erroGeral: string | null): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
  if (erroGeral || !resumo || resumo.origemDaLista === 'nenhuma') return 'FAILED'
  if (resumo.bloqueado || resumo.falhas.length > 0 || !resumo.listaCompleta || resumo.adiadasPeloLimite > 0) return 'PARTIAL'
  return 'SUCCESS'
}

export function startColetorTcePiWorker() {
  const worker = new Worker(
    'coletor-tce-pi',
    async () => {
      const startedAt = new Date()
      let resumo: ResumoDaColetaTcePi | null = null
      let erroGeral: string | null = null

      try {
        resumo = await coletarDoTcePi(REDE_DO_TCE_PI, startedAt)
      } catch (err) {
        erroGeral = motivoCurto(err)
        console.error(`[${CONTEXTO}] Erro na coleta:`, err instanceof Error ? err.message : err)
      }

      const falhas = resumo?.falhas ?? []
      await saveWorkerLog({
        worker: 'coletor-tce-pi',
        status: statusDaColetaTcePi(resumo, erroGeral),
        fonte: 'TCE_PI',
        totalFetched: resumo ? resumo.novasForaDoPncp + resumo.revisitadas : 0,
        totalNew: resumo?.totalNew ?? 0,
        totalDupes: (resumo?.totalDupes ?? 0) + (resumo ? resumo.jaNoPncp + resumo.jaNoPncpPeloMural : 0),
        totalUpdated: resumo?.totalUpdated ?? 0,
        errorMsg: erroGeral ?? (falhas.length > 0 ? `Falhas: ${falhas.slice(0, 20).join(', ')}` : undefined),
        startedAt,
        finishedAt: new Date(),
      })

      if (resumo) console.log(`[${CONTEXTO}] Concluído — ${linhaDoResumoTcePi(resumo)}`)
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
