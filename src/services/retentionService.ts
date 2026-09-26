// ============================================================
// services/retentionService.ts — Limpa licitações que já não servem a
// ninguém, pra não deixar o banco crescer indefinidamente.
//
// Duas regras, ambas protegendo o mesmo conjunto: só é apagada a licitação
// com a qual NENHUM usuário interagiu — sem match, sem checklist, sem plano
// de participação e sem análise de edital.
//
//   1. Encerrada: passou da data de encerramento. É a regra que faz o
//      volume, porque a esmagadora maioria do que é coletado nacionalmente
//      nunca casa com item monitorado de ninguém.
//   2. Antiga: mais de RETENTION_DAYS dias desde a coleta. Rede de segurança
//      para a licitação que vem sem encerramentoAt preenchido na origem, que
//      a regra 1 nunca alcançaria. É o mesmo período usado pelo rematch
//      (findMatchingTendersForItem), então apagar não perde capacidade: uma
//      licitação mais velha que isso já não seria encontrada por "Buscar
//      agora" de qualquer forma.
//
// A exclusão vai em lotes porque uma varredura acumulada pode passar de
// centenas de milhares de linhas, e um deleteMany único seguraria lock na
// tabela por tempo demais.
// ============================================================

import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'

export const RETENTION_DAYS = 90
export const WORKER_LOG_RETENTION_DAYS = 90

const LOTE = 1_000

// Depende de TenderItem ter onDelete: Cascade no schema. Sem isso, a
// exclusão estoura violação de chave estrangeira em toda licitação cujo
// detalhe alguém abriu — abrir o detalhe busca e grava os itens, e isso
// acontece sem criar match nenhum.
const SEM_INTERACAO = {
  tenderMatches: { none: {} },
  checklists: { none: {} },
  participationPlans: { none: {} },
  analysis: null,
} satisfies Prisma.TenderWhereInput

async function apagarEmLotes(where: Prisma.TenderWhereInput): Promise<number> {
  let total = 0

  for (;;) {
    const lote = await prisma.tender.findMany({ where, select: { id: true }, take: LOTE })
    if (lote.length === 0) break

    const { count } = await prisma.tender.deleteMany({
      where: { id: { in: lote.map((t) => t.id) } },
    })

    total += count

    if (count === 0) break
    if (lote.length < LOTE) break
  }

  return total
}

export interface CleanupResult {
  deleted: number
  encerradas: number
  antigas: number
}

export async function cleanupOldUnmatchedTenders(): Promise<CleanupResult> {
  const agora = new Date()
  const cutoff = new Date(agora.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const encerradas = await apagarEmLotes({
    encerramentoAt: { lt: agora },
    ...SEM_INTERACAO,
  })

  const antigas = await apagarEmLotes({
    createdAt: { lt: cutoff },
    ...SEM_INTERACAO,
  })

  return { deleted: encerradas + antigas, encerradas, antigas }
}

// Log de execução dos workers: nunca teve poda e cresce para sempre. O
// volume é pequeno, mas a tabela carrega tudo desde o começo do projeto.
export async function cleanupOldWorkerLogs(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - WORKER_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const { count } = await prisma.workerLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })

  return { deleted: count }
}
