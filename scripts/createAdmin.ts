// ============================================================
// scripts/createAdmin.ts — Cria (ou promove a admin) o primeiro usuário
// administrador. Necessário só uma vez — depois disso, novos usuários são
// criados pelo próprio admin via POST /api/admin/users.
//
// Uso: npx ts-node scripts/createAdmin.ts <email> <senha> [nome]
// ============================================================

import { hashPassword } from '../src/services/authService'
import { prisma } from '../src/services/tenderService'

async function main() {
  const [email, password, name] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Uso: npx ts-node scripts/createAdmin.ts <email> <senha> [nome]')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.')
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isAdmin: true, active: true, accessExpiresAt: null },
    create: { email, name, passwordHash, isAdmin: true },
  })

  console.log(`Admin pronto: ${user.email} (id ${user.id})`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
