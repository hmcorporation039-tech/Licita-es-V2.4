// ============================================================
// scripts/importCatalogo.ts — Importa o catálogo oficial (CATMAT = material,
// CATSER = serviço) da API dadosabertos.compras.gov.br para o cache local
// (tabela CatalogItem), usado no autocomplete de códigos do item monitorado.
//
// Uso:
//   npx ts-node scripts/importCatalogo.ts            # serviço + material
//   npx ts-node scripts/importCatalogo.ts servico    # só serviço (rápido, ~3k)
//   npx ts-node scripts/importCatalogo.ts material   # só material (~345k)
//
// Reexecutável (upsert). CATALOGO_MAX_PAGINAS limita as páginas (teste rápido).
// Em produção isso já roda sozinho (ver catalogoBootstrap.ts).
// ============================================================

import { importarCatalogo } from '../src/services/catalogoImportService'
import { prisma } from '../src/services/tenderService'

async function main() {
  const alvo = (process.argv[2] ?? '').toLowerCase()
  if (alvo === 'material') await importarCatalogo('material')
  else if (alvo === 'servico') await importarCatalogo('servico')
  else {
    await importarCatalogo('servico') // pequeno primeiro
    await importarCatalogo('material')
  }
  console.log('Catálogo importado.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
