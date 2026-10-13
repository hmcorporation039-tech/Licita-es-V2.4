// ============================================================
// scripts/createAdmin.ts — Cria (ou promove a admin) o primeiro usuário
// administrador. Necessário só uma vez — depois disso, novos usuários são
// criados pelo próprio admin via POST /api/admin/users.
//
// Uso:  ADMIN_PASSWORD=<senha> npx ts-node scripts/createAdmin.ts <email> [nome]
// (a senha vem da variável de ambiente para não ficar no histórico do shell
//  nem na lista de processos; como alternativa ainda aceita como 2º argumento)
// ============================================================

import { hashPassword, normalizeEmail } from '../src/services/authService'
import { SENHA_MIN } from '../src/api/passwordPolicy'
import { prisma } from '../src/services/tenderService'

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const senhaPorAmbiente = process.env.ADMIN_PASSWORD
  const [emailArg, ...resto] = args
  const password = senhaPorAmbiente ?? resto[0]
  const name = senhaPorAmbiente ? resto[0] : resto[1]
  const email = emailArg ? normalizeEmail(emailArg) : undefined
  if (!email || !password) {
    console.error('Uso: ADMIN_PASSWORD=<senha> npx ts-node scripts/createAdmin.ts <email> [nome]  (ou: createAdmin.ts <email> <senha> [nome])')
    process.exit(1)
  }
  if (password.length < SENHA_MIN) {
    console.error(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isAdmin: true, active: true, accessExpiresAt: null, disabledByAdmin: false, emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
    // Toda conta precisa de uma Company (ver schema.prisma) — o primeiro
    // admin ganha uma individual, criada junto na mesma escrita.
    create: { email, name, passwordHash, isAdmin: true, emailVerifiedAt: new Date(), company: { create: { name: name ?? email } } },
  })

  console.log(`Admin pronto: ${user.email} (id ${user.id})`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
