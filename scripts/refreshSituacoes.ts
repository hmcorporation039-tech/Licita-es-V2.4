// ============================================================
// scripts/refreshSituacoes.ts — Dispara manualmente a varredura de
// situação (o worker já faz isso periodicamente sozinho — ver
// situacaoUpdateService.ts / workers/index.ts). Útil pra testar sem
// esperar os 5min de delay inicial do worker.
// ============================================================

import { refreshAllOpenSituacoes } from '../src/services/situacaoUpdateService'
import { prisma } from '../src/services/tenderService'

async function main() {
  const { checked, updated } = await refreshAllOpenSituacoes()
  console.log(`${checked} licitação(ões) verificada(s), ${updated} atualizada(s).`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
