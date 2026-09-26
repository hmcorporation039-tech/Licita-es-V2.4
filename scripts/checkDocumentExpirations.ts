// ============================================================
// scripts/checkDocumentExpirations.ts — Dispara manualmente a checagem
// de vencimento de documentos (o worker já faz isso periodicamente
// sozinho — ver documentAlertService.ts / workers/index.ts).
// ============================================================

import { checkExpiringDocuments } from '../src/services/documentAlertService'
import { prisma } from '../src/services/tenderService'

async function main() {
  const { checked, alerted } = await checkExpiringDocuments()
  console.log(`${checked} documento(s) verificado(s), ${alerted} aviso(s) enviado(s).`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
