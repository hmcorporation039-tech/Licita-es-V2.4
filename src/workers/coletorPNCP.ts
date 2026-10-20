// ============================================================
// workers/coletorPNCP.ts — Coleta licitações do PNCP
// API: https://pncp.gov.br/api/consulta/swagger-ui/index.html
// ============================================================

import { Worker, Job } from 'bullmq'
import { redisConnection, matcherQueue } from '../queues'
import { parsePNCPTender } from '../services/pncpParser'
import { saveTenderSeAindaServir, saveWorkerLog } from '../services/tenderService'
import { enfileirarSemTravar } from '../queues/enfileirar'
import { resolveColetaWindow } from '../lib/coletaWindow'
import { ultimaPublicacaoColetada } from '../services/coletaCursorService'
import { avisarAlteracaoDeTender } from '../services/tenderChangeService'
import {
  CAMINHO_PROPOSTA_PNCP,
  CAMINHO_PUBLICACAO_PNCP,
  ContadoresDaColeta,
  ContratacaoPncp,
  ParametrosPncp,
  ResumoDaColetaPncp,
  coletarModalidadesPncp,
  datasDoPncp,
  parametrosDaVarreduraDePropostas,
} from '../services/pncpColeta'
import { ColetorJobPayload, NormalizedTender } from '../types'
import { esconderRepeticoesDaLicitacaoDoPncp, revisarRepeticoesDoPncp } from '../services/duplicataEntreFontes'
import { ResumoDosResultados, conferirResultadosDasLicitacoes } from '../services/resultadoDasLicitacoes'

export const WORKER_DA_COLETA_PNCP = 'coletor-pncp'
export const WORKER_DA_VARREDURA_DE_PROPOSTAS = 'varredura-propostas-pncp'
export const WORKER_DOS_RESULTADOS_PNCP = 'resultados-pncp'

async function esconderRepeticoesSemTravar(tenderId: string, tender: NormalizedTender, contexto: string): Promise<void> {
  try {
    const escondidos = await esconderRepeticoesDaLicitacaoDoPncp(tenderId, tender)
    if (escondidos > 0) console.log(`[${contexto}] ${escondidos} aviso(s) de diário/TCE-CE escondido(s): a mesma licitação chegou pelo PNCP.`)
  } catch (err) {
    console.error(`[${contexto}] Falha ao procurar a mesma licitação em diário/TCE-CE (a do PNCP já foi gravada):`, err)
  }
}

async function revisarRepeticoesSemTravar(contexto: string): Promise<void> {
  try {
    const { escondidos, restaurados, semObjeto, comObjetoDeVolta } = await revisarRepeticoesDoPncp()
    const soma = (contagem: Partial<Record<string, number>>) => Object.values(contagem).reduce<number>((total, n) => total + (n ?? 0), 0)
    if (soma(escondidos) > 0) console.log(`[${contexto}] Avisos repetidos do PNCP escondidos: ${JSON.stringify(escondidos)}`)
    console.log(`[${contexto}] Avisos escondidos antes que voltaram a aparecer (não se confirmaram como repetição do PNCP): ${soma(restaurados)} ${JSON.stringify(restaurados)}`)
    if (semObjeto > 0 || comObjetoDeVolta > 0) console.log(`[${contexto}] Avisos de diário sem objeto: ${semObjeto} escondido(s), ${comObjetoDeVolta} de volta com objeto.`)
  } catch (err) {
    console.error(`[${contexto}] Falha ao revisar avisos de diário/TCE-CE repetidos do PNCP:`, err)
  }
}

export async function gravarContratacoesPncp(
  itens: ContratacaoPncp[],
  contadores: ContadoresDaColeta,
  contexto: string
): Promise<void> {
  for (const rawTender of itens) {
    contadores.vistos++
    try {
      const tender = parsePNCPTender(rawTender)
      const result = await saveTenderSeAindaServir(tender)

      if (!result) {
        contadores.descartados++
      } else if (result.isNew) {
        contadores.novos++
        await enfileirarSemTravar(matcherQueue, 'match-tender', { tenderId: result.tenderId }, contexto)
        await esconderRepeticoesSemTravar(result.tenderId, tender, contexto)
      } else if (result.changed) {
        contadores.atualizados++
        await avisarAlteracaoDeTender(result.tenderId, result.changedFields)
      } else {
        contadores.inalterados++
      }
    } catch (itemErr) {
      contadores.comErro++
      console.error(`[${contexto}] Erro ao processar item:`, itemErr)
    }
  }
}

interface ExecucaoPncp {
  worker: string
  contexto: string
  caminho: string
  parametros: ParametrosPncp
  descricao: string
}

function textoDoResumo(resumo: ResumoDaColetaPncp): string {
  const c = resumo.contadores
  return `vistos: ${c.vistos}, novos: ${c.novos}, atualizados: ${c.atualizados}, inalterados: ${c.inalterados}, já encerrados/homologados descartados: ${c.descartados}, com erro: ${c.comErro}, novas tentativas: ${resumo.tentativasExtras}`
}

async function executarColetaPncp(job: Job<ColetorJobPayload>, execucao: ExecucaoPncp): Promise<ResumoDaColetaPncp> {
  const startedAt = new Date()
  console.log(`[${execucao.contexto}] Iniciando ${execucao.descricao}`)

  let resumo: ResumoDaColetaPncp
  try {
    resumo = await coletarModalidadesPncp({
      caminho: execucao.caminho,
      parametros: execucao.parametros,
      contexto: execucao.contexto,
      gravar: (itens, contadores) => gravarContratacoesPncp(itens, contadores, execucao.contexto),
      aoTerminarModalidade: (indice, total) => job.updateProgress(Math.round((indice / total) * 100)),
    })
  } catch (err) {
    await saveWorkerLog({
      worker: execucao.worker,
      status: 'FAILED',
      fonte: 'PNCP',
      errorMsg: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt: new Date(),
    })
    throw err
  }

  const c = resumo.contadores
  await saveWorkerLog({
    worker: execucao.worker,
    status: resumo.status,
    fonte: 'PNCP',
    totalFetched: c.vistos,
    totalNew: c.novos,
    totalDupes: c.inalterados + c.atualizados,
    totalUpdated: c.atualizados,
    errorMsg: resumo.falhas.length > 0 ? resumo.falhas.slice(0, 20).join('; ') : undefined,
    startedAt,
    finishedAt: new Date(),
  })

  console.log(`[${execucao.contexto}] Concluído (${resumo.status}) — ${textoDoResumo(resumo)}`)

  if (resumo.status === 'FAILED') {
    throw new Error(`${execucao.descricao} falhou em todas as consultas ao PNCP: ${resumo.falhas.slice(0, 3).join('; ')}`)
  }
  return resumo
}

async function coletarPublicacoes(job: Job<ColetorJobPayload>) {
  const { dataInicial, dataFinal } = resolveColetaWindow(job.data, {
    ultimaPublicacaoColetada: await ultimaPublicacaoColetada('PNCP'),
  })
  return executarColetaPncp(job, {
    worker: WORKER_DA_COLETA_PNCP,
    contexto: 'PNCP Worker',
    caminho: CAMINHO_PUBLICACAO_PNCP,
    parametros: { dataInicial: datasDoPncp(dataInicial), dataFinal: datasDoPncp(dataFinal) },
    descricao: `coleta ${dataInicial} → ${dataFinal}`,
  })
}

async function varrerPropostasAbertas(job: Job<ColetorJobPayload>) {
  const parametros = parametrosDaVarreduraDePropostas()
  const resumo = await executarColetaPncp(job, {
    worker: WORKER_DA_VARREDURA_DE_PROPOSTAS,
    contexto: 'PNCP Propostas',
    caminho: CAMINHO_PROPOSTA_PNCP,
    parametros,
    descricao: `varredura das contratações recebendo proposta (prazo até ${parametros.dataFinal})`,
  })
  await revisarRepeticoesSemTravar('PNCP Propostas')
  return resumo
}

export async function conferirResultadosNoPncp(): Promise<ResumoDosResultados> {
  const startedAt = new Date()
  const resumo = await conferirResultadosDasLicitacoes()
  if (resumo.pulada) {
    console.warn('[Resultado PNCP] Conferência anterior ainda em andamento — pulando esta execução.')
    return resumo
  }
  const motivos = [
    ...(resumo.parouNoTeto ? [`parou no teto de ${resumo.requisicoes} requisições; continua na próxima execução`] : []),
    ...(resumo.parouPorBloqueio ? ['o PNCP limitou as requisições; continua na próxima execução'] : []),
    ...resumo.falhas.slice(0, 20),
  ]
  await saveWorkerLog({
    worker: WORKER_DOS_RESULTADOS_PNCP,
    status: resumo.falhas.length > 0 ? 'PARTIAL' : 'SUCCESS',
    totalFetched: resumo.conferidas,
    totalNew: resumo.vencedores,
    totalUpdated: resumo.finalizadas,
    errorMsg: motivos.length > 0 ? motivos.join('; ') : undefined,
    startedAt,
    finishedAt: new Date(),
  })
  console.log(
    `[Resultado PNCP] Concluído — ${resumo.conferidas} licitação(ões) conferida(s), ${resumo.itensCriados} item(ns) criado(s), ${resumo.vencedores} vencedor(es) gravado(s), ${resumo.finalizadas} com resultado final, ${resumo.requisicoes} requisição(ões), ${resumo.falhas.length} falha(s).`
  )
  return resumo
}

// Worker principal
export function startColetorPNCPWorker() {
  const worker = new Worker<ColetorJobPayload>(
    'coletor-pncp',
    async (job: Job<ColetorJobPayload>) => {
      if (job.data.varredura === 'propostas') await varrerPropostasAbertas(job)
      else if (job.data.varredura === 'resultados') await conferirResultadosNoPncp()
      else await coletarPublicacoes(job)
    },
    {
      connection: redisConnection,
      concurrency: 1, // Uma coleta PNCP por vez (respeitar rate limit)
      // Jobs de coleta são longos (várias páginas, 1 req/1.2s) e o worker fica a
      // maior parte do tempo ocioso entre ciclos — o padrão do BullMQ (checar
      // jobs travados a cada 30s) gasta requisições demais no Redis à toa; ver
      // README sobre o limite do plano gratuito do Upstash.
      stalledInterval: 300_000, // 5min
      lockDuration: 600_000, // 10min — cobre uma coleta paginada inteira
    }
  )

  worker.on('completed', (job) => {
    console.log(`[PNCP Worker] Job ${job.id} concluído.`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[PNCP Worker] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
