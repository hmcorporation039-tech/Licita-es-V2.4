// ============================================================
// services/documentAlertService.ts — Avisa quando um documento do
// cofre da empresa (CompanyDocument) está perto de vencer.
//
// Avisa uma vez em cada marco (30, 15 e 5 dias antes) e uma vez ao
// vencer. A decisão de quando avisar está em lib/alertaDeDocumento.ts
// (deveAlertarVencimento), que usa o lastAlertedAt para não repetir o
// aviso dentro do mesmo marco. Renovar o documento com uma validade
// mais distante tira ele da consulta automaticamente.
// ============================================================

import { prisma } from './tenderService'
import { sendDocumentExpiryEmail } from './emailService'
import { formatarDiaDoCalendario } from '../lib/dataDeBrasilia'
import { quandoVence } from '../lib/plural'
import { deveAlertarVencimento, MARCOS_DE_VENCIMENTO } from '../lib/alertaDeDocumento'
import { SELECT_DO_DESTINATARIO, acessoDoDestinatarioComEmpresa } from './avisoDeAcessoEncerrado'
import { linksDeDescadastro } from '../lib/descadastro'

const DIA_MS = 24 * 60 * 60 * 1000
const MARCO_MAIS_LONGE = Math.max(...MARCOS_DE_VENCIMENTO)

export async function checkExpiringDocuments(): Promise<{ checked: number; alerted: number }> {
  const now = new Date()
  const limite = new Date(now.getTime() + MARCO_MAIS_LONGE * DIA_MS)

  const docs = await prisma.companyDocument.findMany({
    where: {
      dataValidade: { lte: limite },
      user: { receberAvisoDeDocumento: true },
    },
    include: { user: { select: SELECT_DO_DESTINATARIO } },
  })

  let alerted = 0
  for (const doc of docs) {
    if (!doc.dataValidade) continue
    if (acessoDoDestinatarioComEmpresa(doc.user, now.getTime()).situacao !== 'ativo') continue
    const diasRestantes = Math.ceil((doc.dataValidade.getTime() - now.getTime()) / DIA_MS)
    if (!deveAlertarVencimento(diasRestantes, doc.lastAlertedAt, now)) continue

    try {
      await sendDocumentExpiryEmail({
        to: doc.user.email,
        documentName: doc.nome,
        diasRestantes,
        dataValidade: doc.dataValidade,
        descadastro: linksDeDescadastro(doc.userId, 'aviso-de-documento'),
      })

      await prisma.notification.create({
        data: {
          userId: doc.userId,
          type: 'EMAIL',
          title: diasRestantes < 0 ? `Documento vencido: ${doc.nome}` : `Documento ${quandoVence(diasRestantes)}: ${doc.nome}`,
          body: `Validade: ${formatarDiaDoCalendario(doc.dataValidade)}`,
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
