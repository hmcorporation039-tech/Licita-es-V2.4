// ============================================================
// scripts/backfillNormColumns.ts — Preenche objeto_norm/objeto_resumido_norm/
// orgao_norm/municipio_norm para licitações já coletadas antes da busca
// passar a ignorar acento (ver comentário no schema.prisma / tenders.ts).
// Novas licitações já são salvas com essas colunas preenchidas (tenderService.ts).
// ============================================================

import { prisma } from '../src/services/tenderService'
import { normalize } from '../src/lib/geoService'

const BATCH_SIZE = 500

async function main() {
  const total = await prisma.tender.count({ where: { objetoNorm: null } })
  console.log(`${total} licitação(ões) sem as colunas normalizadas.`)

  let processed = 0
  for (;;) {
    const batch = await prisma.tender.findMany({
      where: { objetoNorm: null },
      select: { id: true, objeto: true, objetoResumido: true, orgao: true, municipio: true },
      take: BATCH_SIZE,
    })
    if (batch.length === 0) break

    await prisma.$transaction(
      batch.map((t) =>
        prisma.tender.update({
          where: { id: t.id },
          data: {
            objetoNorm: normalize(t.objeto),
            objetoResumidoNorm: t.objetoResumido ? normalize(t.objetoResumido) : null,
            orgaoNorm: t.orgao ? normalize(t.orgao) : null,
            municipioNorm: t.municipio ? normalize(t.municipio) : null,
          },
        })
      )
    )

    processed += batch.length
    console.log(`${processed}/${total} processado(s)...`)
  }

  await backfillItens()

  console.log('Concluído.')
  await prisma.$disconnect()
}

async function backfillItens() {
  const total = await prisma.tenderItem.count({ where: { descricaoNorm: null } })
  console.log(`${total} item(ns) de licitação sem a descrição normalizada.`)

  let processed = 0
  for (;;) {
    const batch = await prisma.tenderItem.findMany({
      where: { descricaoNorm: null },
      select: { id: true, descricao: true },
      take: BATCH_SIZE,
    })
    if (batch.length === 0) break

    await prisma.$transaction(
      batch.map((i) =>
        prisma.tenderItem.update({ where: { id: i.id }, data: { descricaoNorm: normalize(i.descricao) } })
      )
    )

    processed += batch.length
    console.log(`${processed}/${total} item(ns) processado(s)...`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
