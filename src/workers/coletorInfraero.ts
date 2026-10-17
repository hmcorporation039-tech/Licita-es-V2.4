import { Worker } from 'bullmq'
import { matcherQueue, redisConnection } from '../queues'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { prisma, saveWorkerLog } from '../services/tenderService'
import { maiorIdColetado } from '../services/coletaCursorService'
import { idDaLicitacaoInfraero } from '../services/infraeroParser'
import {
  FALHAS_SEGUIDAS_PARA_DESISTIR,
  LIMITES_PADRAO,
  LeituraPorId,
  LimitesDaVarredura,
  MotivoDaParada,
  REDE_DA_INFRAERO,
  RedeDaInfraero,
  RegistroDaInfraero,
  deveGravarNova,
  escolherRevisitas,
  inicioDaVarredura,
  lerDetalhe,
  motivoCurto,
  varrerNovos,
} from '../services/infraeroVarredura'
import { NormalizedTender } from '../types'
import { salvarLote } from './coletorHtmlShared'

const CONTEXTO = 'Infraero Worker'
const PREFIXO_DO_FONTE_ID = 'INFRAERO-'

export interface ResumoDaColetaInfraero {
  inicio: number
  ultimoIdVisitado: number | null
  motivoDaParada: MotivoDaParada
  requisicoes: number
  naoEncontrados: number
  ignorados: number
  revisitadas: number
  lidas: number
  totalNew: number
  totalDupes: number
  totalUpdated: number
  situacoesAlteradas: number
  falhas: string[]
}

async function registrosDaInfraero(): Promise<RegistroDaInfraero[]> {
  const tenders = await prisma.tender.findMany({
    where: { fonte: 'INFRAERO' },
    select: { id: true, fonteId: true, situacao: true, aberturaAt: true, situacaoCheckedAt: true },
  })
  return tenders.flatMap((t) => {
    const idLicitacao = idDaLicitacaoInfraero(t.fonteId)
    return idLicitacao === undefined ? [] : [{ id: t.id, idLicitacao, situacao: t.situacao, aberturaAt: t.aberturaAt, situacaoCheckedAt: t.situacaoCheckedAt }]
  })
}

async function revisitar(registros: RegistroDaInfraero[], rede: RedeDaInfraero, falhas: string[]): Promise<{ lidas: LeituraPorId[]; visitados: RegistroDaInfraero[] }> {
  const lidas: LeituraPorId[] = []
  const visitados: RegistroDaInfraero[] = []
  let falhasSeguidas = 0
  for (const registro of registros) {
    visitados.push(registro)
    try {
      lidas.push({ idLicitacao: registro.idLicitacao, leitura: await lerDetalhe(registro.idLicitacao, rede) })
      falhasSeguidas = 0
    } catch (err) {
      falhas.push(`${registro.idLicitacao} (${motivoCurto(err)})`)
      if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) break
    }
  }
  return { lidas, visitados }
}

async function atualizarSituacoes(atualizacoes: { registro: RegistroDaInfraero; tender: NormalizedTender }[], visitados: RegistroDaInfraero[], agora: Date): Promise<number> {
  let alteradas = 0
  const comLeitura = new Set(atualizacoes.map((a) => a.registro.id))

  for (const { registro, tender } of atualizacoes) {
    const situacao = tender.situacao
    if (!situacao || situacao === registro.situacao) {
      await prisma.tender.update({ where: { id: registro.id }, data: { situacaoCheckedAt: agora } })
      continue
    }
    await prisma.tender.update({ where: { id: registro.id }, data: { situacao, situacaoCheckedAt: agora } })
    alteradas++
    if (situacao === 'ABERTA') await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: registro.id }, CONTEXTO)
  }

  const semLeitura = visitados.filter((r) => !comLeitura.has(r.id)).map((r) => r.id)
  if (semLeitura.length > 0) await prisma.tender.updateMany({ where: { id: { in: semLeitura } }, data: { situacaoCheckedAt: agora } })

  return alteradas
}

export async function coletarInfraero(rede: RedeDaInfraero = REDE_DA_INFRAERO, agora = new Date(), limites: LimitesDaVarredura = LIMITES_PADRAO): Promise<ResumoDaColetaInfraero> {
  const registros = await registrosDaInfraero()
  const porId = new Map(registros.map((r) => [r.idLicitacao, r]))
  const inicio = inicioDaVarredura(await maiorIdColetado('INFRAERO', PREFIXO_DO_FONTE_ID))

  const varredura = await varrerNovos(inicio, rede, limites)
  const jaLidos = new Set(varredura.lidas.map((l) => l.idLicitacao))
  const revisita = await revisitar(escolherRevisitas(registros, jaLidos, agora), rede, varredura.falhas)

  const novos: NormalizedTender[] = []
  const atualizacoes: { registro: RegistroDaInfraero; tender: NormalizedTender }[] = []
  let ignorados = 0

  for (const { idLicitacao, leitura } of [...varredura.lidas, ...revisita.lidas]) {
    if (leitura.tipo !== 'licitacao') {
      if (leitura.tipo === 'ignorado') ignorados++
      continue
    }
    const registro = porId.get(idLicitacao)
    if (registro) atualizacoes.push({ registro, tender: leitura.tender })
    else if (deveGravarNova(leitura.tender, agora)) novos.push(leitura.tender)
    else ignorados++
  }

  const salvos = await salvarLote([...novos, ...atualizacoes.map((a) => a.tender)], CONTEXTO)
  const situacoesAlteradas = await atualizarSituacoes(atualizacoes, revisita.visitados, agora)

  return {
    inicio,
    ultimoIdVisitado: varredura.ultimoIdVisitado,
    motivoDaParada: varredura.motivoDaParada,
    requisicoes: varredura.requisicoes + revisita.visitados.length,
    naoEncontrados: varredura.naoEncontrados,
    ignorados,
    revisitadas: revisita.visitados.length,
    lidas: novos.length + atualizacoes.length,
    totalNew: salvos.totalNew,
    totalDupes: salvos.totalDupes,
    totalUpdated: salvos.totalUpdated,
    situacoesAlteradas,
    falhas: varredura.falhas,
  }
}

export function startColetorInfraeroWorker() {
  const worker = new Worker(
    'coletor-infraero',
    async () => {
      const startedAt = new Date()
      let resumo: ResumoDaColetaInfraero | null = null
      let erroGeral: string | null = null

      try {
        resumo = await coletarInfraero(REDE_DA_INFRAERO, startedAt)
      } catch (err) {
        erroGeral = motivoCurto(err)
        console.error(`[${CONTEXTO}] Erro na coleta:`, err instanceof Error ? err.message : err)
      }

      const falhas = resumo?.falhas ?? []
      const semNadaLido = resumo?.lidas === 0 && resumo.motivoDaParada === 'falhas'
      const status = erroGeral || semNadaLido ? 'FAILED' : falhas.length > 0 ? 'PARTIAL' : 'SUCCESS'

      await saveWorkerLog({
        worker: 'coletor-infraero',
        status,
        fonte: 'INFRAERO',
        totalFetched: resumo?.lidas ?? 0,
        totalNew: resumo?.totalNew ?? 0,
        totalDupes: resumo?.totalDupes ?? 0,
        totalUpdated: resumo?.totalUpdated ?? 0,
        errorMsg: erroGeral ?? (falhas.length > 0 ? `Ids com falha: ${falhas.slice(0, 20).join(', ')}` : undefined),
        startedAt,
        finishedAt: new Date(),
      })

      if (resumo) {
        console.log(
          `[${CONTEXTO}] Concluído — ids ${resumo.inicio} a ${resumo.ultimoIdVisitado ?? resumo.inicio} (parada: ${resumo.motivoDaParada}), ` +
            `requisições: ${resumo.requisicoes}, não encontrados: ${resumo.naoEncontrados}, ignorados: ${resumo.ignorados}, ` +
            `revisitadas: ${resumo.revisitadas}, novos: ${resumo.totalNew}, atualizados: ${resumo.totalUpdated}, ` +
            `situações alteradas: ${resumo.situacoesAlteradas}${falhas.length > 0 ? `, falhas: ${falhas.length}` : ''}`
        )
      }
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
