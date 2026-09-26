// ============================================================
// scripts/rebuildMatches.ts — Recalcula tender_matches do zero
// usando o algoritmo de match atual. Necessário sempre que a lógica
// de matching (matcherService.ts) mudar de forma incompatível com
// os dados já persistidos (ex: troca de similaridade fuzzy por
// casamento literal de palavra-chave).
// ============================================================

import { prisma } from '../src/services/tenderService'
import { findMatchingTendersForItem } from '../src/services/matcherService'

async function main() {
  const deleted = await prisma.tenderMatch.deleteMany({})
  console.log(`Removidos ${deleted.count} match(es) antigo(s).`)

  const items = await prisma.monitoredItem.findMany({ where: { active: true } })
  let totalCreated = 0

  for (const item of items) {
    const candidates = await findMatchingTendersForItem(
      {
        keywords: item.keywords,
        catmatCodes: item.catmatCodes,
        catserCodes: item.catserCodes,
        ufs: item.ufs,
        modalidades: item.modalidades,
        orgaos: item.orgaos,
        uasgCodes: item.uasgCodes,
        valorMin: item.valorMin ? Number(item.valorMin) : null,
        valorMax: item.valorMax ? Number(item.valorMax) : null,
        raioKm: item.raioKm,
        origemLat: item.origemLat,
        origemLng: item.origemLng,
      },
      3650 // cobre todo o histórico coletado até hoje
    )

    if (candidates.length === 0) {
      console.log(`Item "${item.name}" (${item.id}): 0 match(es).`)
      continue
    }

    await prisma.tenderMatch.createMany({
      data: candidates.map((c) => ({
        tenderId: c.tenderId,
        monitoredItemId: item.id,
        userId: item.userId,
        score: c.score,
        matchedKeywords: c.matchedKeywords,
      })),
      skipDuplicates: true,
    })

    totalCreated += candidates.length
    console.log(`Item "${item.name}" (${item.id}): ${candidates.length} match(es).`)
  }

  console.log(`Concluído: ${totalCreated} match(es) recriado(s) para ${items.length} item(ns) ativo(s).`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
