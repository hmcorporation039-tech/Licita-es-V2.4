import { prisma } from '../../src/services/tenderService'
import { normalizeEmail } from '../../src/services/authService'
import { desligarSegundoFator } from '../../src/services/segundoFator'

async function main() {
  const [acao, emailDigitado] = process.argv.slice(2)
  if (!emailDigitado || (acao !== 'situacao' && acao !== 'desligar')) throw new Error('Uso: segundoFator.ts situacao <email> | desligar <email>')
  const email = normalizeEmail(emailDigitado)
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, companyId: true, isAdmin: true, totpAtivadoEm: true, totpCodigosDeRecuperacao: true },
  })
  if (!user) throw new Error(`Nenhuma conta com o e-mail ${email}`)
  console.log(`${email}: admin=${user.isAdmin} ativo=${Boolean(user.totpAtivadoEm)} desde=${user.totpAtivadoEm?.toISOString() ?? '-'} codigosDeRecuperacao=${user.totpCodigosDeRecuperacao.length}`)
  if (acao === 'situacao') return
  await desligarSegundoFator(user.id)
  await prisma.auditLog.create({
    data: { action: 'SEGUNDO_FATOR_DESLIGADO', actorEmail: 'script de operação', entityType: 'usuario', entityId: user.id, companyId: user.companyId, metadata: { motivo: 'aparelho e códigos de recuperação perdidos' } },
  })
  console.log('Login em duas etapas desligado e sessões encerradas. Na próxima entrada, a conta cadastra o aplicativo de novo.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
