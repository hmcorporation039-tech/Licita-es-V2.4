// ============================================================
// Status dos 6 agentes da Bela para o "Prédio H&M" (painel 3D, repositório salas-3D).
//
// A cada 30 s o processo dos workers olha o que o sistema JÁ grava (WorkerLog, status
// das análises, últimas gravações de casamento, estudo e lance) e manda um sinal curto
// por agente para a central de status. Nada novo é gravado aqui, e nenhum dado de
// cliente sai: só o nome do agente, o status, uma frase e os números do dia (somados).
//
// Ligado só quando CENTRAL_STATUS_URL existe. Central fora do ar nunca atrapalha a
// Bela: timeout curto e erro engolido.
// ============================================================

import { prisma } from './tenderService'
import { inicioDoDiaEmBrasilia } from '../lib/dataDeBrasilia'

export type AgenteDoPredio = 'garimpeira' | 'casadora' | 'analista' | 'orcamentista' | 'estrategista' | 'bela'
export type StatusNoPredio = 'trabalhando' | 'ocioso' | 'erro'

export interface SinalParaOPredio {
  sistema: 'licita-bela'
  agente: AgenteDoPredio
  status: StatusNoPredio
  mensagem: string
  metricas: Record<string, number>
  passa_para?: { agente: AgenteDoPredio; item: string }
}

/** O que o banco diz agora (lido de uma vez, para a regra abaixo ser pura e testável). */
export interface FotoDaBela {
  coleta: { rodando: string | null; ultimaFalha: { fonte: string; erro: string; em: Date } | null; ultimoSucesso: Date | null; novasHoje: number }
  casamento: { ultimo: Date | null; hoje: number }
  analise: { rodando: number; ultimaFalha: { erro: string; em: Date } | null; ultimaConcluida: Date | null; hoje: number }
  orcamento: { ultimo: Date | null; hoje: number }
  estrategia: { rodando: number; ultimaFalha: { erro: string; em: Date } | null; ultimaConcluida: Date | null; hoje: number }
  bela: { pregoesAoVivo: number; lancesHoje: number }
}

const RECENTE_MS = 3 * 60_000
const ERRO_RECENTE_MS = 30 * 60_000
const COLETA_TRAVADA_MS = 10 * 60_000

const recente = (d: Date | null, agora: Date, janela = RECENTE_MS) => d !== null && agora.getTime() - d.getTime() <= janela

/** Mensagem de erro sem endereço completo (só o domínio) e curta: vai para uma tela. */
export function erroResumido(texto: string | null | undefined): string {
  return (texto ?? 'Falha sem mensagem')
    .replace(/https?:\/\/([^/\s?#]+)[^\s]*/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

// Falha recente e sem sucesso depois dela = erro na sala.
function falhaAtiva(falha: { em: Date } | null, sucessoDepois: Date | null, agora: Date): boolean {
  if (!falha || !recente(falha.em, agora, ERRO_RECENTE_MS)) return false
  return !sucessoDepois || sucessoDepois.getTime() < falha.em.getTime()
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/**
 * Monta os 6 sinais. `anterior` é a foto do ciclo passado: quando um número do dia cresce,
 * a tarefa "passa" para o próximo agente (o papel voando no prédio).
 */
export function montarSinais(f: FotoDaBela, anterior: FotoDaBela | null, agora: Date): SinalParaOPredio[] {
  const cresceu = (atual: number, antes: number | undefined) => (anterior && antes !== undefined && atual > antes ? atual - antes : 0)
  const sinal = (agente: AgenteDoPredio, status: StatusNoPredio, mensagem: string, metricas: Record<string, number>): SinalParaOPredio => ({
    sistema: 'licita-bela',
    agente,
    status,
    mensagem,
    metricas,
  })

  // Garimpeira: coletas nas fontes públicas
  const garimpeira = falhaAtiva(f.coleta.ultimaFalha, f.coleta.ultimoSucesso, agora)
    ? sinal('garimpeira', 'erro', `${f.coleta.ultimaFalha!.fonte}: ${f.coleta.ultimaFalha!.erro}`, {})
    : f.coleta.rodando
      ? sinal('garimpeira', 'trabalhando', `Lendo ${f.coleta.rodando.replace(/^coletor-/, '').toUpperCase()}`, {})
      : sinal('garimpeira', 'ocioso', 'Esperando a próxima coleta', {})
  garimpeira.metricas = { licitacoes_hoje: f.coleta.novasHoje }
  const novas = cresceu(f.coleta.novasHoje, anterior?.coleta.novasHoje)
  if (novas) garimpeira.passa_para = { agente: 'casadora', item: plural(novas, 'licitação nova', 'licitações novas') }

  // Casadora: liga licitação a cliente
  const casadora = recente(f.casamento.ultimo, agora)
    ? sinal('casadora', 'trabalhando', 'Ligando licitações aos clientes', {})
    : sinal('casadora', 'ocioso', 'Esperando licitações novas', {})
  casadora.metricas = { casamentos_hoje: f.casamento.hoje }
  const casamentos = cresceu(f.casamento.hoje, anterior?.casamento.hoje)
  if (casamentos) casadora.passa_para = { agente: 'analista', item: plural(casamentos, 'aviso para cliente', 'avisos para clientes') }

  // Analista de editais
  const analista = falhaAtiva(f.analise.ultimaFalha, f.analise.ultimaConcluida, agora)
    ? sinal('analista', 'erro', f.analise.ultimaFalha!.erro, {})
    : f.analise.rodando > 0
      ? sinal('analista', 'trabalhando', `Lendo ${plural(f.analise.rodando, 'edital', 'editais')}`, {})
      : sinal('analista', 'ocioso', 'Esperando o próximo edital', {})
  analista.metricas = { editais_analisados_hoje: f.analise.hoje }
  const analises = cresceu(f.analise.hoje, anterior?.analise.hoje)
  if (analises) analista.passa_para = { agente: 'orcamentista', item: plural(analises, 'edital analisado', 'editais analisados') }

  // Orçamentista: estudo de custo
  const orcamentista = recente(f.orcamento.ultimo, agora)
    ? sinal('orcamentista', 'trabalhando', 'Montando estudo de custo', {})
    : sinal('orcamentista', 'ocioso', 'Esperando um pedido de preço', {})
  orcamentista.metricas = { estudos_hoje: f.orcamento.hoje }
  const estudos = cresceu(f.orcamento.hoje, anterior?.orcamento.hoje)
  if (estudos) orcamentista.passa_para = { agente: 'estrategista', item: plural(estudos, 'estudo de custo', 'estudos de custo') }

  // Estrategista: concorrentes e preços vencedores
  const estrategista = falhaAtiva(f.estrategia.ultimaFalha, f.estrategia.ultimaConcluida, agora)
    ? sinal('estrategista', 'erro', f.estrategia.ultimaFalha!.erro, {})
    : f.estrategia.rodando > 0
      ? sinal('estrategista', 'trabalhando', `Estudando ${plural(f.estrategia.rodando, 'concorrente', 'concorrentes')}`, {})
      : sinal('estrategista', 'ocioso', 'Esperando um pedido de análise', {})
  estrategista.metricas = { concorrentes_hoje: f.estrategia.hoje }
  const estrategias = cresceu(f.estrategia.hoje, anterior?.estrategia.hoje)
  if (estrategias) estrategista.passa_para = { agente: 'bela', item: plural(estrategias, 'análise de concorrência', 'análises de concorrência') }

  // Bela: pregão ao vivo (só sugere o lance; quem envia é o cliente)
  const bela =
    f.bela.pregoesAoVivo > 0
      ? sinal('bela', 'trabalhando', `Acompanhando ${plural(f.bela.pregoesAoVivo, 'pregão', 'pregões')} ao vivo`, {})
      : sinal('bela', 'ocioso', 'Nenhum pregão ao vivo agora', {})
  bela.metricas = { pregoes_ao_vivo: f.bela.pregoesAoVivo, lances_hoje: f.bela.lancesHoje }

  return [garimpeira, casadora, analista, orcamentista, estrategista, bela]
}

export async function lerFotoDaBela(agora: Date): Promise<FotoDaBela> {
  const inicio = inicioDoDiaEmBrasilia(agora)
  const [
    coletaRodando,
    coletaFalha,
    coletaSucesso,
    novasHoje,
    ultimoMatch,
    matchesHoje,
    analiseRodando,
    analiseFalha,
    analiseConcluida,
    analisesHoje,
    ultimoEstudo,
    estudosHoje,
    estrategiaRodando,
    estrategiaFalha,
    estrategiaConcluida,
    estrategiasHoje,
    pregoesAoVivo,
    lancesHoje,
  ] = await Promise.all([
    prisma.workerLog.findFirst({
      where: { worker: { startsWith: 'coletor-' }, status: 'RUNNING', startedAt: { gte: new Date(agora.getTime() - COLETA_TRAVADA_MS) } },
      orderBy: { startedAt: 'desc' },
      select: { worker: true },
    }),
    prisma.workerLog.findFirst({ where: { worker: { startsWith: 'coletor-' }, status: 'FAILED', finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' }, select: { worker: true, errorMsg: true, finishedAt: true } }),
    prisma.workerLog.findFirst({ where: { worker: { startsWith: 'coletor-' }, status: { in: ['SUCCESS', 'PARTIAL'] }, finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
    prisma.tender.count({ where: { createdAt: { gte: inicio } } }),
    prisma.tenderMatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.tenderMatch.count({ where: { createdAt: { gte: inicio } } }),
    prisma.tenderAnalysis.count({ where: { status: 'RUNNING' } }),
    prisma.tenderAnalysis.findFirst({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, select: { errorMsg: true, updatedAt: true } }),
    prisma.tenderAnalysis.findFirst({ where: { status: 'DONE' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.tenderAnalysis.count({ where: { status: 'DONE', updatedAt: { gte: inicio } } }),
    prisma.costStudy.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.costStudy.count({ where: { updatedAt: { gte: inicio } } }),
    prisma.analiseDeConcorrente.count({ where: { status: 'RUNNING' } }),
    prisma.analiseDeConcorrente.findFirst({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, select: { erro: true, updatedAt: true } }),
    prisma.analiseDeConcorrente.findFirst({ where: { status: 'DONE' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.analiseDeConcorrente.count({ where: { status: 'DONE', updatedAt: { gte: inicio } } }),
    prisma.pregaoAcompanhamento.count({ where: { encerradoEm: null } }),
    prisma.pregaoLance.count({ where: { origem: 'MEU_LANCE', createdAt: { gte: inicio } } }),
  ])

  return {
    coleta: {
      rodando: coletaRodando?.worker ?? null,
      ultimaFalha: coletaFalha?.finishedAt ? { fonte: coletaFalha.worker.replace(/^coletor-/, '').toUpperCase(), erro: erroResumido(coletaFalha.errorMsg), em: coletaFalha.finishedAt } : null,
      ultimoSucesso: coletaSucesso?.finishedAt ?? null,
      novasHoje,
    },
    casamento: { ultimo: ultimoMatch?.createdAt ?? null, hoje: matchesHoje },
    analise: {
      rodando: analiseRodando,
      ultimaFalha: analiseFalha ? { erro: erroResumido(analiseFalha.errorMsg), em: analiseFalha.updatedAt } : null,
      ultimaConcluida: analiseConcluida?.updatedAt ?? null,
      hoje: analisesHoje,
    },
    orcamento: { ultimo: ultimoEstudo?.updatedAt ?? null, hoje: estudosHoje },
    estrategia: {
      rodando: estrategiaRodando,
      ultimaFalha: estrategiaFalha ? { erro: erroResumido(estrategiaFalha.erro), em: estrategiaFalha.updatedAt } : null,
      ultimaConcluida: estrategiaConcluida?.updatedAt ?? null,
      hoje: estrategiasHoje,
    },
    bela: { pregoesAoVivo, lancesHoje },
  }
}

export async function enviarSinal(sinal: SinalParaOPredio, env: NodeJS.ProcessEnv = process.env, enviar: typeof fetch = fetch): Promise<boolean> {
  const url = env.CENTRAL_STATUS_URL?.trim()
  if (!url) return false
  try {
    const resp = await enviar(`${url.replace(/\/$/, '')}/api/status`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: {
        'Content-Type': 'application/json',
        ...(env.CENTRAL_STATUS_TOKEN ? { Authorization: `Bearer ${env.CENTRAL_STATUS_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...sinal, timestamp: new Date().toISOString() }),
    })
    return resp.ok
  } catch {
    return false // central fora do ar: o prédio só mostra a sala apagada
  }
}

/** Liga o envio a cada 30 s. Sem CENTRAL_STATUS_URL, não faz nada. Devolve a função de parar. */
export function iniciarStatusParaOPredio(intervaloMs = 30_000): () => void {
  if (!process.env.CENTRAL_STATUS_URL) return () => {}
  let anterior: FotoDaBela | null = null
  let avisouFalha = false
  const ciclo = async () => {
    try {
      const agora = new Date()
      const foto = await lerFotoDaBela(agora)
      const enviados = await Promise.all(montarSinais(foto, anterior, agora).map((s) => enviarSinal(s)))
      anterior = foto
      if (enviados.some((ok) => !ok) && !avisouFalha) {
        avisouFalha = true
        console.warn('[Prédio H&M] A central de status não respondeu; tento de novo a cada 30 s.')
      } else if (enviados.every(Boolean)) avisouFalha = false
    } catch (err) {
      console.warn('[Prédio H&M] Falha ao ler o status dos agentes:', err instanceof Error ? err.message : err)
    }
  }
  void ciclo()
  const timer = setInterval(ciclo, intervaloMs)
  timer.unref?.()
  console.log('[Prédio H&M] Enviando o status dos agentes para a central a cada 30 s.')
  return () => clearInterval(timer)
}
