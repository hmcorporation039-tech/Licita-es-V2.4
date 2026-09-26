// ============================================================
// scripts/enxugarRawJson.ts — Reescreve o raw_json das licitações já
// coletadas, deixando só o que é realmente lido depois.
//
// Coletas novas já nascem enxutas (ver pncpParser.ts/comprasnetParser.ts);
// este script é o backfill das linhas que ficaram para trás.
//
//   PNCP       → { anoCompra, sequencialCompra, orgaoEntidade: { cnpj } }
//   ComprasNet → {} (nenhum consumidor lê raw_json dessa fonte)
//
// Roda em SQL bruto porque jsonb_build_object reescreve tudo dentro do
// banco: puxar centenas de milhares de payloads até o Node e devolvê-los
// pelo Prisma levaria ordens de grandeza mais tempo.
//
// ATENÇÃO: o UPDATE não devolve espaço ao disco por conta própria — as
// linhas antigas viram tuplas mortas e o autovacuum só as libera para
// reuso interno. Para o arquivo encolher de fato é preciso rodar
// `VACUUM FULL tenders` depois, que toma lock exclusivo na tabela. Faça
// backup antes (`npm run producao:backup`) e escolha uma janela sem uso.
// ============================================================

import 'dotenv/config'
import { prisma } from '../src/services/tenderService'
import { confirmarAlvoRemoto } from './lib/alvoDoBanco'

const LOTE = 5_000

async function tamanhoDaTabela(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ tamanho: string }[]>`
    SELECT pg_size_pretty(pg_total_relation_size('tenders')) AS tamanho
  `
  return row.tamanho
}

async function pendentesPNCP(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total FROM tenders
    WHERE fonte = 'PNCP'
      AND jsonb_typeof(raw_json) = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(raw_json)) > 3
  `
  return Number(row.total)
}

async function enxugarPNCP(): Promise<number> {
  let total = 0

  for (;;) {
    const afetadas = await prisma.$executeRaw`
      WITH alvo AS (
        SELECT id FROM tenders
        WHERE fonte = 'PNCP'
          AND jsonb_typeof(raw_json) = 'object'
          AND (SELECT count(*) FROM jsonb_object_keys(raw_json)) > 3
        LIMIT ${LOTE}
      )
      UPDATE tenders t
      SET raw_json = jsonb_build_object(
        'anoCompra', t.raw_json -> 'anoCompra',
        'sequencialCompra', t.raw_json -> 'sequencialCompra',
        'orgaoEntidade', jsonb_build_object('cnpj', t.raw_json -> 'orgaoEntidade' -> 'cnpj')
      )
      FROM alvo
      WHERE t.id = alvo.id
    `

    if (afetadas === 0) break

    total += afetadas
    console.log(`  PNCP: ${total} enxugada(s)...`)
  }

  return total
}

async function enxugarComprasnet(): Promise<number> {
  let total = 0

  for (;;) {
    const afetadas = await prisma.$executeRaw`
      WITH alvo AS (
        SELECT id FROM tenders
        WHERE fonte = 'COMPRASNET' AND raw_json <> '{}'::jsonb
        LIMIT ${LOTE}
      )
      UPDATE tenders t
      SET raw_json = '{}'::jsonb
      FROM alvo
      WHERE t.id = alvo.id
    `

    if (afetadas === 0) break

    total += afetadas
    console.log(`  ComprasNet: ${total} enxugada(s)...`)
  }

  return total
}

async function main() {
  await confirmarAlvoRemoto('reescrever o raw_json de todas as licitações da tabela')

  const antes = await tamanhoDaTabela()
  const pendentes = await pendentesPNCP()

  console.log(`Tabela tenders antes: ${antes}`)
  console.log(`${pendentes} licitação(ões) do PNCP com payload completo.\n`)

  const pncp = await enxugarPNCP()
  const comprasnet = await enxugarComprasnet()

  const depois = await tamanhoDaTabela()

  console.log(`\nConcluído — ${pncp} do PNCP, ${comprasnet} do ComprasNet.`)
  console.log(`Tabela tenders depois: ${depois}`)
  console.log(
    '\nO tamanho só cai de verdade depois de `VACUUM FULL tenders` (lock exclusivo — ver cabeçalho deste script).'
  )

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
