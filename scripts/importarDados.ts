// ============================================================
// scripts/importarDados.ts — Restaura no banco novo o que o
// exportarDados.ts tirou do antigo.
//
// O schema precisa já existir no destino (rode `npm run migrar:producao`
// antes). Este script só repõe as linhas, preservando os ids originais —
// assim todas as chaves estrangeiras continuam válidas.
//
// Uso:
//   DATABASE_URL="postgresql://..." npm run dados:importar -- ./backup-2026-09-16
// ============================================================

import 'dotenv/config'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { TABELAS } from './tabelas'

const prisma = new PrismaClient()
const LOTE = 500

async function main() {
  const origem = process.argv[2]
  if (!origem) {
    console.error('Uso: npm run dados:importar -- ./backup-AAAA-MM-DD')
    process.exit(1)
  }
  if (!existsSync(join(origem, '_resumo.json'))) {
    console.error(`"${origem}" não parece uma pasta de backup (falta _resumo.json).`)
    process.exit(1)
  }

  const alvo = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***:***@')
  console.log(`Backup:  ${origem}`)
  console.log(`Destino: ${alvo}\n`)

  // Se o destino já tiver dados, avisa em vez de misturar em silêncio.
  const usuariosNoDestino = await prisma.user.count()
  if (usuariosNoDestino > 0 && !process.argv.includes('--forcar')) {
    console.error(
      `O banco de destino já tem ${usuariosNoDestino} usuário(s).\n` +
        'Importar por cima pode duplicar ou conflitar. Se for mesmo o que você quer, rode de novo com --forcar.'
    )
    process.exit(1)
  }

  let totalGeral = 0

  for (const tabela of TABELAS) {
    const arquivo = join(origem, `${tabela}.json`)
    if (!existsSync(arquivo)) {
      console.log(`  ${tabela}: sem arquivo, pulando`)
      continue
    }

    const linhas: unknown[] = JSON.parse(readFileSync(arquivo, 'utf-8'))
    if (linhas.length === 0) {
      console.log(`  ${tabela}: vazio`)
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelo = (prisma as any)[tabela]
    let inseridos = 0

    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE)
      const { count } = await modelo.createMany({ data: lote, skipDuplicates: true })
      inseridos += count
      process.stdout.write(`\r  ${tabela}: ${inseridos}/${linhas.length}   `)
    }

    totalGeral += inseridos
    const pulados = linhas.length - inseridos
    console.log(`\r  ${tabela}: ${inseridos} inserido(s)${pulados > 0 ? ` (${pulados} já existiam)` : ''}          `)
  }

  console.log(`\nPronto — ${totalGeral} registro(s) restaurado(s).\n`)
  await prisma.$disconnect()
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('\nFalhou:', err instanceof Error ? err.message : err)
    await prisma.$disconnect()
    process.exit(1)
  })
}
