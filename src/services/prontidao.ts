// ============================================================
// services/prontidao.ts — "O código que está rodando é compatível com o banco?"
//
// Motivo: o /api/health só responde que o processo está vivo; ele não toca no
// banco. Numa publicação em que o código novo sobe ANTES das migrations (ou o
// banco está fora do ar), a API ficava "saudável" e, ao mesmo tempo, devolvendo
// 500 "Erro interno" no login (a coluna nova não existia).
//
// O endpoint GET /api/health/ready usa esta checagem. Configurado como
// "Healthcheck Path" do serviço da API no Railway, ele faz o deploy FALHAR (e a
// versão antiga continuar no ar) quando:
//   - o banco não responde; ou
//   - existe migration no código (prisma/migrations) que o banco ainda não aplicou.
// Banco À FRENTE do código (rollback para uma versão antiga) é permitido: as
// migrations são aditivas.
// ============================================================

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from './tenderService'

export interface Prontidao {
  ok: boolean
  motivo?: 'banco-indisponivel' | 'migrations-pendentes' | 'sem-historico-de-migrations'
  pendentes?: number
}

// Pasta de migrations do Prisma no deploy. Fica na raiz do projeto; em dev/CI o
// cwd é a raiz, e no Railway também (o build roda na raiz do repositório).
export function pastaDeMigrations(): string {
  return process.env.PRISMA_MIGRATIONS_DIR ?? join(process.cwd(), 'prisma', 'migrations')
}

export function migrationsDoCodigo(pasta = pastaDeMigrations()): string[] {
  try {
    return readdirSync(pasta, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
      .map((d) => d.name)
      .sort()
  } catch {
    return [] // sem a pasta (ex.: imagem enxuta): não dá para comparar, não bloqueia
  }
}

// Migrations que o código conhece e o banco ainda não aplicou (pura, testável).
export function migrationsPendentes(noCodigo: string[], noBanco: string[]): string[] {
  const aplicadas = new Set(noBanco)
  return noCodigo.filter((nome) => !aplicadas.has(nome))
}

export async function verificarProntidao(): Promise<Prontidao> {
  let aplicadas: string[]
  try {
    const linhas = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `
    aplicadas = linhas.map((l) => l.migration_name)
  } catch (err) {
    // Distingue "banco fora do ar" de "banco sem a tabela de histórico".
    const msg = err instanceof Error ? err.message : String(err)
    if (/_prisma_migrations/.test(msg) && /does not exist|relation/i.test(msg)) {
      return { ok: false, motivo: 'sem-historico-de-migrations' }
    }
    return { ok: false, motivo: 'banco-indisponivel' }
  }

  const noCodigo = migrationsDoCodigo()
  const pendentes = migrationsPendentes(noCodigo, aplicadas)
  if (pendentes.length > 0) return { ok: false, motivo: 'migrations-pendentes', pendentes: pendentes.length }
  return { ok: true }
}
