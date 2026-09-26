// ============================================================
// scripts/cleanupOldTenders.ts — Dispara manualmente a limpeza de
// licitações sem interação (o worker já faz isso periodicamente
// sozinho — ver retentionService.ts / workers/index.ts).
// ============================================================

import 'dotenv/config'
import {
  cleanupOldUnmatchedTenders,
  cleanupOldWorkerLogs,
  RETENTION_DAYS,
  WORKER_LOG_RETENTION_DAYS,
} from '../src/services/retentionService'
import { prisma } from '../src/services/tenderService'
import { confirmarAlvoRemoto } from './lib/alvoDoBanco'

async function main() {
  await confirmarAlvoRemoto('apagar licitações encerradas/antigas que ninguém acompanha')

  const { deleted, encerradas, antigas } = await cleanupOldUnmatchedTenders()

  console.log(`${deleted} licitação(ões) sem interação removida(s):`)
  console.log(`  ${encerradas} por já ter passado da data de encerramento`)
  console.log(`  ${antigas} por ter mais de ${RETENTION_DAYS} dias de coleta`)

  const { deleted: logs } = await cleanupOldWorkerLogs()
  console.log(`${logs} log(s) de worker com mais de ${WORKER_LOG_RETENTION_DAYS} dias removido(s).`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
