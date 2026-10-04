// ============================================================
// scripts/excluirEmpresa.ts — Executa um pedido de exclusão de conta (LGPD).
// Sem --confirmar só MOSTRA o que seria apagado. Faça backup antes (docs/DEPLOY_E_BACKUP.md).
//
// Uso:  npm run excluir-empresa -- --empresa <id-da-empresa>               (conferir)
//       npm run excluir-empresa -- --empresa <id-da-empresa> --confirmar   (excluir)
// O id aparece no aviso de "Pedido de exclusão" e em Administração → Empresas.
// ============================================================

import { prisma } from '../src/services/tenderService'
import { ExclusaoRecusadaError, excluirEmpresa } from '../src/services/exclusaoDeEmpresa'

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--empresa')
  const id = i >= 0 ? args[i + 1] : undefined
  const executar = args.includes('--confirmar')
  if (!id) {
    console.error('Uso: npm run excluir-empresa -- --empresa <id> [--confirmar]')
    process.exit(1)
  }
  const r = await excluirEmpresa(id, executar)
  console.table({ ...r, empresa: `${r.empresa.name} (${r.empresa.id})` })
  console.log(r.executada ? '✅ Empresa excluída. Avise o solicitante por e-mail.' : 'Nada foi apagado. Rode de novo com --confirmar para excluir.')
}

main()
  .catch((err) => {
    console.error(err instanceof ExclusaoRecusadaError ? `Recusado: ${err.message}` : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
