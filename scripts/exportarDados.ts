// ============================================================
// scripts/exportarDados.ts — Tira uma cópia de todos os dados do banco,
// sem depender de pg_dump instalado na máquina.
//
// Gera um arquivo JSON por tabela, na ordem em que as chaves estrangeiras
// permitem restaurar. Serve para sair de um Supabase que venceu e subir
// tudo num banco novo (ver scripts/importarDados.ts).
//
// Uso:
//   DATABASE_URL="postgresql://..." npm run dados:exportar
//   DATABASE_URL="postgresql://..." npm run dados:exportar -- ./minha-pasta
// ============================================================

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { TABELAS } from './tabelas'

const prisma = new PrismaClient()

const LOTE = 1000

// Decimal e Date viram string no JSON; o Prisma aceita as duas de volta na
// importação, então o ciclo fecha sem conversão manual.
function serializar(linhas: unknown[]): string {
  return JSON.stringify(linhas, (_chave, valor) => valor, 2)
}

// As licitações em si são descartáveis — o coletor rebaixa tudo do PNCP em
// algumas horas. Mas checklist, plano de participação e match apontam para
// elas por chave estrangeira, então as que a pessoa tocou têm que vir junto,
// senão a importação falha. Este modo leva só essas.
async function tendersReferenciados(): Promise<Set<string>> {
  const [matches, checklists, planos] = await Promise.all([
    prisma.tenderMatch.findMany({ select: { tenderId: true }, distinct: ['tenderId'] }),
    prisma.tenderChecklist.findMany({ select: { tenderId: true }, distinct: ['tenderId'] }),
    prisma.tenderParticipationPlan.findMany({ select: { tenderId: true }, distinct: ['tenderId'] }),
  ])
  const analises = await prisma.tenderAnalysis.findMany({ select: { tenderId: true } })
  return new Set([...matches, ...checklists, ...planos, ...analises].map((r) => r.tenderId))
}

async function main() {
  const args = process.argv.slice(2)
  const essencial = args.includes('--essencial')
  const destino = args.find((a) => !a.startsWith('--')) ?? join(process.cwd(), `backup-${new Date().toISOString().slice(0, 10)}`)
  mkdirSync(destino, { recursive: true })

  const alvo = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***:***@')
  console.log(`Origem:  ${alvo}`)
  console.log(`Destino: ${destino}\n`)

  const resumo: Record<string, number> = {}

  let filtroTender: { id: { in: string[] } } | undefined
  let filtroTenderItem: { tenderId: { in: string[] } } | undefined

  if (essencial) {
    const ids = Array.from(await tendersReferenciados())
    filtroTender = { id: { in: ids } }
    filtroTenderItem = { tenderId: { in: ids } }
    console.log(`Modo --essencial: das licitações, só as ${ids.length} que alguém realmente tocou.\n`)
  }

  for (const tabela of TABELAS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelo = (prisma as any)[tabela]
    const where = tabela === 'tender' ? filtroTender : tabela === 'tenderItem' ? filtroTenderItem : undefined

    const total: number = await modelo.count({ where })
    const linhas: unknown[] = []

    for (let pulados = 0; pulados < total; pulados += LOTE) {
      linhas.push(...(await modelo.findMany({ where, skip: pulados, take: LOTE })))
      process.stdout.write(`\r  ${tabela}: ${linhas.length}/${total}   `)
    }

    writeFileSync(join(destino, `${tabela}.json`), serializar(linhas), 'utf-8')
    resumo[tabela] = total
    console.log(`\r  ${tabela}: ${total} registro(s)          `)
  }

  writeFileSync(
    join(destino, '_resumo.json'),
    JSON.stringify({ exportadoEm: new Date().toISOString(), tabelas: resumo }, null, 2),
    'utf-8'
  )

  const totalGeral = Object.values(resumo).reduce((a, b) => a + b, 0)
  console.log(`\nPronto — ${totalGeral} registro(s) em ${destino}`)
  console.log('Guarde essa pasta fora do projeto antes de mexer no banco de origem.\n')

  await prisma.$disconnect()
}

// Só executa quando chamado direto na linha de comando. Sem esta guarda,
// qualquer `import` deste arquivo dispara uma exportação real — foi assim que
// o importador sobrescreveu a pasta de backup ao carregar a lista de tabelas.
if (require.main === module) {
  main().catch(async (err) => {
    console.error('\nFalhou:', err instanceof Error ? err.message : err)
    await prisma.$disconnect()
    process.exit(1)
  })
}
