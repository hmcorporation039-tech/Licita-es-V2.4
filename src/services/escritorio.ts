// ============================================================
// services/escritorio.ts — Estado REAL dos 6 agentes do "Escritório da Bela"
// (página admin global). Nada aqui é simulado: o estado sai do que o sistema
// já grava — WorkerLog (coleta), as colunas de status das análises (RUNNING),
// e a recência das últimas gravações de match / estudo / lance. É de propósito
// só leitura e agregado de TODOS os clientes, porque é essa a visão da página.
//
// Por que não uma tabela agent_status nem fila BullMQ: o estado real já existe
// nas tabelas de domínio (mais fiel que a profundidade de uma fila no Redis, e
// consultável do processo da API, que não roda os workers). Decisão travada
// com o Márcio: ler do que já existe, sem criar fluxo novo.
//
// Aprovação: só a Bela tem pedidoAprovacao, e aqui ele é INFORMATIVO — o pregão
// é sugestão (a pessoa confirma o lance no portal). Nenhuma ação de aprovação
// é executada por esta visão admin (ver a rota: só GET /status).
// ============================================================

import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'

export type EstadoDoAgente = 'ocioso' | 'trabalhando' | 'aguardando'

export interface AgenteDoEscritorio {
  id: 'garimpeira' | 'casadora' | 'analista' | 'orcamentista' | 'estrategista' | 'bela'
  nome: string
  cargo: string
  // Ordem do fluxo real de uma licitação, de ponta a ponta (1 = primeira a
  // tocar na licitação). A tela usa isso para dispor as mesas na sequência.
  ordem: number
  estado: EstadoDoAgente
  tarefaAtual: string
  // Só a Bela preenche; nas outras é sempre null (regra travada).
  pedidoAprovacao: string | null
  metricaRotulo: string
  metricaValor: number
  atualizadoEm: string | null
}

// Dados crus lidos do banco. Separados da montagem para a regra de estado ser
// pura e testável sem banco (ver tests/escritorio.test.ts).
export interface DadosDoEscritorio {
  coleta: { rodando: boolean; ultimaColeta: Date | null; novasHoje: number }
  casamento: { ultimo: Date | null; hoje: number }
  analise: { rodando: number; ultima: Date | null; concluidasHoje: number }
  orcamento: { ultimaAtividade: Date | null; estudosHoje: number }
  estrategia: { rodando: number; ultima: Date | null; concluidasHoje: number }
  bela: { disputasAtivas: number; ultimoLance: Date | null; lancesHoje: number; aguardandoConfirmacao: number }
}

// Sem gravação de status próprio: para os agentes que não têm estado explícito
// de "rodando" (matcher, orçamento), "trabalhando" é inferido pela recência da
// última entrega. Folgado de propósito — é um escritório, não um medidor fino.
const RECENTE_MS = 3 * 60_000
// Uma coleta marcada RUNNING que começou há muito provavelmente travou/caiu;
// não deixa a Garimpeira "trabalhando" para sempre por causa de um log órfão.
const COLETA_TRAVADA_MS = 10 * 60_000

function recente(d: Date | null, agora: Date, janela = RECENTE_MS): boolean {
  return d !== null && agora.getTime() - d.getTime() <= janela
}

function hora(d: Date | null): string | null {
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

// 00:00 de hoje em Brasília. São Paulo é UTC-3 fixo (sem horário de verão desde
// 2019), então o dia começa às 03:00 UTC — simples e suficiente para "hoje".
export function inicioDoDiaBR(agora: Date): Date {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
  const [ano, mes, dia] = partes.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0))
}

export function montarAgentes(d: DadosDoEscritorio, agora: Date): AgenteDoEscritorio[] {
  const garimpeira: AgenteDoEscritorio = {
    id: 'garimpeira',
    nome: 'Garimpeira',
    cargo: 'Garimpa licitações em dezenas de fontes públicas',
    ordem: 1,
    estado: d.coleta.rodando ? 'trabalhando' : 'ocioso',
    tarefaAtual: d.coleta.rodando
      ? 'Garimpando licitações novas'
      : d.coleta.ultimaColeta
        ? `Última garimpagem às ${hora(d.coleta.ultimaColeta)}`
        : 'Sem garimpagem recente',
    pedidoAprovacao: null,
    metricaRotulo: 'Licitações novas hoje',
    metricaValor: d.coleta.novasHoje,
    atualizadoEm: iso(d.coleta.ultimaColeta),
  }

  const casadora: AgenteDoEscritorio = {
    id: 'casadora',
    nome: 'Casadora',
    cargo: 'Cruza cada licitação com os itens dos clientes',
    ordem: 2,
    estado: recente(d.casamento.ultimo, agora) ? 'trabalhando' : 'ocioso',
    tarefaAtual: recente(d.casamento.ultimo, agora)
      ? 'Cruzando licitações novas com os itens monitorados'
      : d.casamento.ultimo
        ? `Último cruzamento às ${hora(d.casamento.ultimo)}`
        : 'Sem cruzamento recente',
    pedidoAprovacao: null,
    metricaRotulo: 'Cruzamentos hoje',
    metricaValor: d.casamento.hoje,
    atualizadoEm: iso(d.casamento.ultimo),
  }

  const analista: AgenteDoEscritorio = {
    id: 'analista',
    nome: 'Analista de editais',
    cargo: 'Baixa, resume e classifica os editais',
    ordem: 3,
    estado: d.analise.rodando > 0 ? 'trabalhando' : 'ocioso',
    tarefaAtual:
      d.analise.rodando > 0
        ? `Lendo ${d.analise.rodando} ${d.analise.rodando > 1 ? 'editais' : 'edital'}`
        : d.analise.ultima
          ? `Última leitura às ${hora(d.analise.ultima)}`
          : 'Sem leitura recente',
    pedidoAprovacao: null,
    metricaRotulo: 'Editais lidos hoje',
    metricaValor: d.analise.concluidasHoje,
    atualizadoEm: iso(d.analise.ultima),
  }

  const orcamentista: AgenteDoEscritorio = {
    id: 'orcamentista',
    nome: 'Orçamentista',
    cargo: 'Monta os custos e diz se a licitação é viável',
    ordem: 4,
    estado: recente(d.orcamento.ultimaAtividade, agora) ? 'trabalhando' : 'ocioso',
    tarefaAtual: recente(d.orcamento.ultimaAtividade, agora)
      ? 'Montando os custos de uma licitação'
      : d.orcamento.ultimaAtividade
        ? `Último estudo às ${hora(d.orcamento.ultimaAtividade)}`
        : 'Sem estudo recente',
    pedidoAprovacao: null,
    metricaRotulo: 'Estudos de custo hoje',
    metricaValor: d.orcamento.estudosHoje,
    atualizadoEm: iso(d.orcamento.ultimaAtividade),
  }

  const estrategista: AgenteDoEscritorio = {
    id: 'estrategista',
    nome: 'Estrategista',
    cargo: 'Analisa concorrentes e monta o recurso',
    ordem: 5,
    estado: d.estrategia.rodando > 0 ? 'trabalhando' : 'ocioso',
    tarefaAtual:
      d.estrategia.rodando > 0
        ? `Analisando ${d.estrategia.rodando} concorrente${d.estrategia.rodando > 1 ? 's' : ''}`
        : d.estrategia.ultima
          ? `Última análise às ${hora(d.estrategia.ultima)}`
          : 'Sem análise recente',
    pedidoAprovacao: null,
    metricaRotulo: 'Concorrentes analisados hoje',
    metricaValor: d.estrategia.concluidasHoje,
    atualizadoEm: iso(d.estrategia.ultima),
  }

  // A Bela é a única que "aguarda você": quando há disputa com o robô ativo em
  // que um concorrente cobriu, ela sugere o lance e espera a pessoa confirmar
  // no portal. Aqui isso é só contagem informativa — a confirmação é do cliente,
  // no painel de pregão dele, não desta visão admin.
  const belaAguardando = d.bela.aguardandoConfirmacao > 0
  const bela: AgenteDoEscritorio = {
    id: 'bela',
    nome: 'Bela',
    cargo: 'Atende no app e sugere o lance no pregão',
    ordem: 6,
    estado: belaAguardando ? 'aguardando' : d.bela.disputasAtivas > 0 && recente(d.bela.ultimoLance, agora) ? 'trabalhando' : 'ocioso',
    tarefaAtual: belaAguardando
      ? `${d.bela.aguardandoConfirmacao} lance${d.bela.aguardandoConfirmacao > 1 ? 's' : ''} sugerido${d.bela.aguardandoConfirmacao > 1 ? 's' : ''}, aguardando o cliente confirmar no portal`
      : d.bela.disputasAtivas > 0
        ? `Acompanhando ${d.bela.disputasAtivas} ${d.bela.disputasAtivas > 1 ? 'pregões' : 'pregão'} em disputa`
        : 'Sem pregão em disputa',
    pedidoAprovacao: belaAguardando
      ? `${d.bela.aguardandoConfirmacao} cliente${d.bela.aguardandoConfirmacao > 1 ? 's' : ''} com lance sugerido pela Bela aguardando confirmação no portal. Quem dá o lance é o cliente.`
      : null,
    metricaRotulo: 'Lances registrados hoje',
    metricaValor: d.bela.lancesHoje,
    atualizadoEm: iso(d.bela.ultimoLance),
  }

  return [garimpeira, casadora, analista, orcamentista, estrategista, bela]
}

export async function coletarDados(agora: Date): Promise<DadosDoEscritorio> {
  const inicio = inicioDoDiaBR(agora)
  const limiteColeta = new Date(agora.getTime() - COLETA_TRAVADA_MS)

  const [
    coletaRodando,
    ultimaColeta,
    novasHoje,
    ultimoMatch,
    matchesHoje,
    analiseRodando,
    ultimaAnalise,
    analisesHoje,
    ultimoEstudo,
    estudosHoje,
    estrategiaRodando,
    ultimaEstrategia,
    estrategiasHoje,
    disputasAtivas,
    ultimoLance,
    lancesHoje,
    aguardandoConfirmacao,
  ] = await Promise.all([
    prisma.workerLog.findFirst({ where: { worker: { startsWith: 'coletor-' }, status: 'RUNNING', startedAt: { gte: limiteColeta } }, select: { id: true } }),
    prisma.workerLog.findFirst({ where: { worker: { startsWith: 'coletor-' }, status: { in: ['SUCCESS', 'PARTIAL'] }, finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
    prisma.tender.count({ where: { createdAt: { gte: inicio } } }),
    prisma.tenderMatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.tenderMatch.count({ where: { createdAt: { gte: inicio } } }),
    prisma.tenderAnalysis.count({ where: { status: 'RUNNING' } }),
    prisma.tenderAnalysis.findFirst({ where: { status: 'DONE' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.tenderAnalysis.count({ where: { status: 'DONE', updatedAt: { gte: inicio } } }),
    prisma.costStudy.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.costStudy.count({ where: { updatedAt: { gte: inicio } } }),
    prisma.analiseDeConcorrente.count({ where: { status: 'RUNNING' } }),
    prisma.analiseDeConcorrente.findFirst({ where: { status: 'DONE' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.analiseDeConcorrente.count({ where: { status: 'DONE', updatedAt: { gte: inicio } } }),
    prisma.pregaoAcompanhamento.count({ where: { encerradoEm: null } }),
    prisma.pregaoLance.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.pregaoLance.count({ where: { origem: 'MEU_LANCE', createdAt: { gte: inicio } } }),
    contarAguardandoConfirmacao(),
  ])

  return {
    coleta: { rodando: coletaRodando !== null, ultimaColeta: ultimaColeta?.finishedAt ?? null, novasHoje },
    casamento: { ultimo: ultimoMatch?.createdAt ?? null, hoje: matchesHoje },
    analise: { rodando: analiseRodando, ultima: ultimaAnalise?.updatedAt ?? null, concluidasHoje: analisesHoje },
    orcamento: { ultimaAtividade: ultimoEstudo?.updatedAt ?? null, estudosHoje },
    estrategia: { rodando: estrategiaRodando, ultima: ultimaEstrategia?.updatedAt ?? null, concluidasHoje: estrategiasHoje },
    bela: { disputasAtivas, ultimoLance: ultimoLance?.createdAt ?? null, lancesHoje, aguardandoConfirmacao },
  }
}

// Disputas em aberto com o robô ativo em que o lance mais recente foi do
// concorrente (MELHOR_LANCE): é quando a Bela tem uma sugestão pendente e a
// pessoa precisa agir. DISTINCT ON pega o último lance de cada acompanhamento.
async function contarAguardandoConfirmacao(): Promise<number> {
  const linhas = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*)::bigint AS n FROM (
      SELECT DISTINCT ON (a."id") a."id", l."origem"
      FROM "pregao_acompanhamentos" a
      JOIN "pregao_lances" l ON l."acompanhamento_id" = a."id"
      WHERE a."encerrado_em" IS NULL AND a."robo_ativo" = true
      ORDER BY a."id", l."created_at" DESC
    ) ultimo
    WHERE ultimo."origem" = 'MELHOR_LANCE'
  `)
  return Number(linhas[0]?.n ?? 0)
}

export async function statusDoEscritorio(agora: Date = new Date()): Promise<AgenteDoEscritorio[]> {
  return montarAgentes(await coletarDados(agora), agora)
}
