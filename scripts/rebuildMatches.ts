// ============================================================
// scripts/rebuildMatches.ts — Recalcula tender_matches do zero
// usando o algoritmo de match atual. Necessário sempre que a lógica
// de matching (matcherService.ts) mudar de forma incompatível com
// os dados já persistidos (ex: troca de similaridade fuzzy por
// casamento literal de palavra-chave).
// ============================================================

import { prisma } from '../src/services/tenderService'
import { findMatchingTendersForItem } from '../src/services/matcherService'
import { confirmarAlvoRemoto } from './lib/alvoDoBanco'

async function main() {
  await confirmarAlvoRemoto('recalcular os tender_matches de todos os itens ativos (remove os que não batem mais)')

  const items = await prisma.monitoredItem.findMany({ where: { active: true } })
  let totalCriados = 0
  let totalRemovidos = 0

  for (const item of items) {
    const candidates = await findMatchingTendersForItem(
      {
        keywords: item.keywords,
        palavrasDeExclusao: item.palavrasDeExclusao,
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
      3650
    )
    const tenderIdsValidos = candidates.map((c) => c.tenderId)

    const { criados, removidos } = await prisma.$transaction(async (tx) => {
      const removidos = await tx.tenderMatch.deleteMany({
        where: { monitoredItemId: item.id, tenderId: { notIn: tenderIdsValidos } },
      })
      const criados = await tx.tenderMatch.createMany({
        data: candidates.map((c) => ({
          tenderId: c.tenderId,
          monitoredItemId: item.id,
          companyId: item.companyId,
          userId: item.userId,
          score: c.score,
          matchedKeywords: c.matchedKeywords,
          dentroDeObraCompleta: c.dentroDeObraCompleta,
        })),
        skipDuplicates: true,
      })
      return { criados: criados.count, removidos: removidos.count }
    })

    totalCriados += criados
    totalRemovidos += removidos
    console.log(`Item "${item.name}" (${item.id}): ${candidates.length} match(es) válido(s), ${criados} novo(s), ${removidos} removido(s).`)
  }

  console.log(
    `Concluído: ${items.length} item(ns) ativo(s), ${totalCriados} match(es) novo(s), ${totalRemovidos} removido(s). O estado de "lido" dos que continuam foi preservado.`
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
