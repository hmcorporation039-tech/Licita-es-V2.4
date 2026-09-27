// ============================================================
// scripts/empresasBackfill.ts — Etapa 1a ("Empresa multi-usuário"), parte
// intermediária do rollout: cria 1 Company (tipo PESSOA_FISICA) por usuário
// que ainda não tem uma, e propaga company_id para monitored_items,
// company_documents, tender_checklists e tender_participation_plans.
//
// Roda em SQL puro ($queryRaw/$executeRaw) de propósito: este script é
// pensado para rodar ENTRE a migration 00000000000004_empresas_fundacao
// (adiciona as colunas, nullable) e a 00000000000005_empresas_constraints
// (trava NOT NULL + troca a chave única) — nesse meio-tempo o
// schema.prisma / Prisma Client ainda pode não conhecer as colunas novas,
// então a API tipada do Prisma não serve aqui.
//
// Idempotente: só mexe em quem ainda está com company_id nulo, então pode
// rodar mais de uma vez sem duplicar nada.
//
// Uso: npx ts-node scripts/empresasBackfill.ts
// ============================================================

import { randomUUID } from 'node:crypto'
import { prisma } from '../src/services/tenderService'

const BATCH_SIZE = 500

async function backfillUsuarios() {
  const pendentes = await prisma.$queryRaw<{ id: string; name: string | null; email: string }[]>`
    SELECT id, name, email FROM users WHERE company_id IS NULL
  `
  console.log(`${pendentes.length} usuário(s) sem empresa.`)

  let processados = 0
  for (const u of pendentes) {
    const companyId = randomUUID()
    const nome = u.name ?? u.email

    await prisma.$executeRaw`
      INSERT INTO companies (id, tipo, name, created_at, updated_at)
      VALUES (${companyId}, 'PESSOA_FISICA', ${nome}, now(), now())
    `
    await prisma.$executeRaw`
      UPDATE users SET company_id = ${companyId} WHERE id = ${u.id}
    `

    processados += 1
    if (processados % BATCH_SIZE === 0) console.log(`${processados}/${pendentes.length} usuário(s)...`)
  }
  console.log(`${processados} usuário(s) — empresa criada.`)
}

async function backfillTabela(tabela: string) {
  // company_id vem do dono (user_id) de cada linha — 1:1 nesta fase, já
  // que cada usuário tem sua própria empresa recém-criada.
  const resultado = await prisma.$executeRawUnsafe(`
    UPDATE ${tabela} t
    SET company_id = u.company_id
    FROM users u
    WHERE t.user_id = u.id AND t.company_id IS NULL
  `)
  console.log(`${tabela}: ${resultado} linha(s) atualizada(s).`)
}

async function main() {
  await backfillUsuarios()
  await backfillTabela('monitored_items')
  await backfillTabela('company_documents')
  await backfillTabela('tender_checklists')
  await backfillTabela('tender_participation_plans')

  const restantes = await prisma.$queryRaw<{ tabela: string; restantes: bigint }[]>`
    SELECT 'users' AS tabela, count(*) AS restantes FROM users WHERE company_id IS NULL
    UNION ALL SELECT 'monitored_items', count(*) FROM monitored_items WHERE company_id IS NULL
    UNION ALL SELECT 'company_documents', count(*) FROM company_documents WHERE company_id IS NULL
    UNION ALL SELECT 'tender_checklists', count(*) FROM tender_checklists WHERE company_id IS NULL
    UNION ALL SELECT 'tender_participation_plans', count(*) FROM tender_participation_plans WHERE company_id IS NULL
  `
  console.log('\nConferência final (deve ser tudo zero):')
  restantes.forEach((r) => console.log(`  ${r.tabela}: ${r.restantes}`))

  const faltou = restantes.some((r) => Number(r.restantes) > 0)
  if (faltou) {
    console.error('\nAinda sobrou linha sem company_id — não rode a migration 00000000000005 ainda.')
    process.exit(1)
  }

  console.log('\nConcluído — pode rodar a migration 00000000000005_empresas_constraints agora.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
