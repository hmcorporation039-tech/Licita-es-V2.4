// ============================================================
// scripts/importarDumpSupabase.ts — Carrega o backup que o painel do
// Supabase entrega (db_cluster-*.backup.gz) num banco novo.
//
// O arquivo é um dump de cluster em SQL puro: traz roles, schemas internos
// do Supabase e as tabelas da aplicação, tudo junto. Este script pega só os
// blocos COPY das nossas 12 tabelas e os replica no destino.
//
// Duas coisas que ele resolve e que um `psql < dump.sql` não resolveria:
//
//   1. A ordem dos COPY no dump é ALFABÉTICA, não por dependência —
//      company_documents vem antes de users, tender_matches antes de tenders.
//      Replicar nessa ordem quebra por chave estrangeira. Aqui os blocos são
//      lidos primeiro e só então gravados na ordem de dependência.
//
//   2. O dump é do schema v1, que não tem as colunas da v2. Como cada COPY
//      declara sua lista de colunas, as colunas novas simplesmente ficam com
//      o default — por isso o destino precisa estar migrado ANTES.
//
// Uso:
//   1. npm run migrar:producao            (cria o schema v2 no destino)
//   2. npm run dump:importar -- ./db_cluster-11-09-2026@14-40-45.backup.gz
// ============================================================

import 'dotenv/config'
import { createReadStream, existsSync } from 'fs'
import { createGunzip } from 'zlib'
import { createInterface } from 'readline'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { Client } from 'pg'
import { from as copyFrom } from 'pg-copy-streams'
import { TABELAS_SQL } from './tabelas'

interface BlocoCopy {
  tabela: string
  colunas: string
  linhas: string[]
}

// Lê o dump inteiro e devolve os blocos COPY que interessam, indexados pela
// tabela. Aceita .gz ou .sql.
async function lerBlocos(caminho: string): Promise<Map<string, BlocoCopy>> {
  const entrada = createReadStream(caminho)
  const fonte = caminho.endsWith('.gz') ? entrada.pipe(createGunzip()) : entrada
  const linhas = createInterface({ input: fonte, crlfDelay: Infinity })

  const blocos = new Map<string, BlocoCopy>()
  const interessa = new Set<string>(TABELAS_SQL)
  let atual: BlocoCopy | null = null

  for await (const linha of linhas) {
    if (atual) {
      // Fim do bloco COPY é uma linha com exatamente \.
      if (linha === '\\.') {
        blocos.set(atual.tabela, atual)
        atual = null
        continue
      }
      atual.linhas.push(linha)
      continue
    }

    const inicio = /^COPY public\.([a-z_]+) \(([^)]*)\) FROM stdin;$/.exec(linha)
    if (inicio && interessa.has(inicio[1])) {
      atual = { tabela: inicio[1], colunas: inicio[2], linhas: [] }
    }
  }

  return blocos
}

async function main() {
  const caminho = process.argv[2]
  if (!caminho || !existsSync(caminho)) {
    console.error('Uso: npm run dump:importar -- ./db_cluster-....backup.gz')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida — aponte para o banco de DESTINO, já migrado.')
    process.exit(1)
  }

  console.log(`Dump:    ${caminho}`)
  console.log(`Destino: ${process.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***:***@')}\n`)

  console.log('Lendo o dump...')
  const blocos = await lerBlocos(caminho)
  console.log(`${blocos.size} tabela(s) com dados encontradas.\n`)

  const cliente = new Client({ connectionString: process.env.DATABASE_URL })
  await cliente.connect()

  const jaTem = await cliente.query('SELECT count(*)::int AS n FROM users')
  if (jaTem.rows[0].n > 0 && !process.argv.includes('--forcar')) {
    console.error(`O destino já tem ${jaTem.rows[0].n} usuário(s). Rode com --forcar se for mesmo somar por cima.`)
    await cliente.end()
    process.exit(1)
  }

  let total = 0

  // Ordem de dependência, não a do arquivo.
  for (const tabela of TABELAS_SQL) {
    const bloco = blocos.get(tabela)
    if (!bloco || bloco.linhas.length === 0) {
      console.log(`  ${tabela}: vazio`)
      continue
    }

    const destino = cliente.query(copyFrom(`COPY public.${tabela} (${bloco.colunas}) FROM STDIN`))
    await pipeline(Readable.from(bloco.linhas.map((l) => l + '\n')), destino)

    total += bloco.linhas.length
    console.log(`  ${tabela}: ${bloco.linhas.length} registro(s)`)
  }

  console.log(`\nPronto — ${total} registro(s) carregado(s).`)
  console.log('As colunas novas da v2 ficaram com o default; rode `npm run tenders:backfill-norm` em seguida.\n')

  await cliente.end()
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFalhou:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
