import { PrismaClient } from '@prisma/client'

async function main() {
  const numero = Number(process.argv[2])
  if (!Number.isInteger(numero) || numero <= 0) {
    console.error('Uso: npx tsx --env-file=scripts/ops/.env.backup scripts/ops/chamado.ts <número do chamado>')
    process.exit(1)
  }
  const url = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Defina BACKUP_DATABASE_URL (scripts/ops/.env.backup) ou DATABASE_URL')
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    await prisma.$executeRawUnsafe('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    const chamado = await prisma.chamado.findUnique({
      where: { numero },
      include: {
        company: { select: { name: true, planCode: true } },
        user: { select: { name: true, companyRole: true } },
        mensagens: { orderBy: { createdAt: 'asc' }, select: { autor: true, texto: true, createdAt: true } },
      },
    })
    if (!chamado) throw new Error(`Chamado #${numero} não encontrado`)
    const contexto = chamado.contexto as { errosRecentes?: Array<{ codigo?: string }> }
    const codigos = (contexto.errosRecentes ?? []).map((e) => e.codigo).filter((c): c is string => !!c)
    const janela = { gte: new Date(chamado.createdAt.getTime() - 30 * 60 * 1000), lte: new Date(chamado.createdAt.getTime() + 5 * 60 * 1000) }
    const erros = await prisma.erroDoSistema.findMany({
      where: { OR: [...(codigos.length ? [{ codigoDeRastreio: { in: codigos } }] : []), ...(chamado.userId ? [{ userId: chamado.userId, createdAt: janela }] : [])] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { origem: true, codigoDeRastreio: true, metodo: true, rota: true, status: true, mensagem: true, pilha: true, tela: true, versao: true, createdAt: true },
    })
    const linhas = [
      `# Chamado #${chamado.numero} — ${chamado.assunto}`,
      `Tipo ${chamado.tipo} · situação ${chamado.status} · origem ${chamado.origem} · aberto em ${chamado.createdAt.toISOString()}`,
      `Empresa ${chamado.company.name} (plano ${chamado.company.planCode}) · ${chamado.user?.companyRole ?? 'usuário removido'}`,
      '',
      '## Relato',
      chamado.relato,
      '',
      '## Mensagens',
      ...chamado.mensagens.map((m) => `- [${m.autor} ${m.createdAt.toISOString()}] ${m.texto}`),
      '',
      '## Contexto',
      '```json',
      JSON.stringify(chamado.contexto, null, 2),
      '```',
      '',
      `## Erros guardados (${erros.length})`,
      '```json',
      JSON.stringify(erros, null, 2),
      '```',
      '',
      `## Diagnóstico (${chamado.diagnosticoStatus ?? 'nenhum'})`,
      '```json',
      JSON.stringify(chamado.diagnostico, null, 2),
      '```',
    ]
    console.log(linhas.join('\n'))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
