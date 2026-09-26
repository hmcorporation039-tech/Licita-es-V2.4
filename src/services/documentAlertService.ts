// ============================================================
// services/documentAlertService.ts — Avisa quando um documento do
// cofre da empresa (CompanyDocument) está perto de vencer.
//
// Reenvia o aviso a cada ALERT_COOLDOWN_DAYS enquanto o documento
// continuar vencendo/vencido — o filtro por dataValidade na consulta
// já para de considerar o documento automaticamente assim que ele for
// renovado com uma validade mais distante, sem precisar resetar nada.
// ============================================================

import { prisma } from './tenderService'
import { sendDocumentExpiryEmail } from './emailService'

export const ALERT_THRESHOLD_DAYS = 15
export const ALERT_COOLDOWN_DAYS = 7

export async function checkExpiringDocuments(): Promise<{ checked: number; alerted: number }> {
  const now = new Date()
  const threshold = new Date(now.getTime() + ALERT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
  const cooldownCutoff = new Date(now.getTime() - ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)

  const docs = await prisma.companyDocument.findMany({
    where: {
      dataValidade: { lte: threshold },
      OR: [{ lastAlertedAt: null }, { lastAlertedAt: { lte: cooldownCutoff } }],
    },
    include: { user: { select: { id: true, email: true } } },
  })

  let alerted = 0
  for (const doc of docs) {
    if (!doc.dataValidade) continue
    const diasRestantes = Math.ceil((doc.dataValidade.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

    try {
      await sendDocumentExpiryEmail({
        to: doc.user.email,
        documentName: doc.nome,
        diasRestantes,
        dataValidade: doc.dataValidade,
      })

      await prisma.notification.create({
        data: {
          userId: doc.userId,
          type: 'EMAIL',
          title: diasRestantes < 0 ? `Documento vencido: ${doc.nome}` : `Documento vencendo em ${diasRestantes} dia(s): ${doc.nome}`,
          body: `Validade: ${doc.dataValidade.toLocaleDateString('pt-BR')}`,
          sentAt: now,
          metadata: { companyDocumentId: doc.id },
        },
      })

      await prisma.companyDocument.update({ where: { id: doc.id }, data: { lastAlertedAt: now } })
      alerted++
    } catch (err) {
      console.error(`[DocumentAlert] Erro ao avisar sobre documento ${doc.id}:`, err instanceof Error ? err.message : err)
    }
  }

  return { checked: docs.length, alerted }
}
