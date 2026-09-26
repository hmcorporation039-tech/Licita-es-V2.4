// ============================================================
// scripts/exportarSqlBruto.ts — Backup do banco de produção sem depender
// de pg_dump instalado, e sem depender do Prisma.
//
// Por que não usar o exportarDados.ts aqui: ele passa pelo Prisma Client,
// que espera as colunas da v2 (content_hash, token_version...). O banco de
// produção ainda é v1 e não as tem, então o Prisma quebraria. Este script
// lê a lista de colunas do próprio banco e copia o que existir.
//
// A saída sai no MESMO formato do dump do Supabase, então é carregada de
// volta com o scripts/importarDumpSupabase.ts, que já está testado.
//
// Uso:
//   npm run producao:backup -- ./backup-producao.sql
// ============================================================

import 'dotenv/config'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Client } from 'pg'
import { to as copyTo } from 'pg-copy-streams'
import { TABELAS_SQL } from './tabelas'

function clienteProducao(): Client {
  const { RAILWAY_PG_HOST, RAILWAY_PG_PORT, RAILWAY_PG_USER, RAILWAY_PG_PASSWORD, RAILWAY_PG_DB } = process.env
  if (!RAILWAY_PG_HOST || !RAILWAY_PG_PASSWORD) {
    throw new Error('Faltam as variáveis RAILWAY_PG_* no .env')
  }
  return new Client({
    host: RAILWAY_PG_HOST,
    port: Number(RAILWAY_PG_PORT ?? 5432),
    user: RAILWAY_PG_USER ?? 'postgres',
    password: RAILWAY_PG_PASSWORD,
    database: RAILWAY_PG_DB ?? 'railway',
    ssl: { rejectUnauthorized: false },
  })
}

async function main() {
  const destino = process.argv[2] ?? `backup-producao-${new Date().toISOString().slice(0, 10)}.sql`

  const c = clienteProducao()
  await c.connect()
  console.log(`Origem:  ${process.env.RAILWAY_PG_HOST}:${process.env.RAILWAY_PG_PORT}`)
  console.log(`Destino: ${destino}\n`)

  const saida = createWriteStream(destino, { encoding: 'utf-8' })
  saida.write('-- Backup de producao gerado por scripts/exportarSqlBruto.ts\n')
  saida.write(`-- ${new Date().toISOString()}\n\n`)

  let totalGeral = 0

  for (const tabela of TABELAS_SQL) {
    const existe = await c.query(
      `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [tabela]
    )
    if (existe.rows[0].n === 0) {
      console.log(`  ${tabela}: não existe nesta base`)
      continue
    }

    // A lista de colunas vem do banco, não do schema.prisma — é o que permite
    // este script funcionar contra a v1 e contra a v2 sem mudar nada.
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [tabela]
    )
    const listaColunas = cols.rows.map((r) => `"${r.column_name}"`).join(', ')
    const nomesSemAspas = cols.rows.map((r) => r.column_name).join(', ')

    const total = (await c.query(`SELECT count(*)::int n FROM "${tabela}"`)).rows[0].n

    saida.write(`COPY public.${tabela} (${nomesSemAspas}) FROM stdin;\n`)
    await pipeline(c.query(copyTo(`COPY public."${tabela}" (${listaColunas}) TO STDOUT`)), saida, { end: false })
    saida.write('\\.\n\n')

    totalGeral += total
    console.log(`  ${tabela.padEnd(28)} ${total}`)
  }

  await new Promise<void>((resolve) => saida.end(resolve))
  await c.end()

  console.log(`\nPronto — ${totalGeral} registro(s) em ${destino}`)
  console.log('Guarde esse arquivo fora do projeto antes de mexer no banco.\n')
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFalhou:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
