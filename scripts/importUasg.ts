// ============================================================
// scripts/importUasg.ts — Importa a tabela de UASGs (unidades compradoras)
// da API pública dadosabertos.compras.gov.br pro cache local (tabela Uasg).
//
// Uso: npx ts-node scripts/importUasg.ts   (ou: npm run uasg:importar)
// Reexecutável — faz upsert por codigoUasg, então pode rodar de novo pra
// atualizar. Em produção isso já roda sozinho (ver catalogoBootstrap.ts); o
// script existe para rodar à mão quando necessário.
// ============================================================

import { importarUasgs } from '../src/services/catalogoImportService'
import { prisma } from '../src/services/tenderService'

importarUasgs()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
