import type { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { enviarAvisoDeAcessoEncerrado } from './emailTransacional'
import { whereLicitacaoAberta } from '../lib/licitacaoAberta'
import { PLANO_DE_TESTE } from '../lib/acessoEncerrado'
import { acessoDoDestinatario, type AcessoDoDestinatario } from '../lib/acessoDaEmpresa'
import { quantidadeCom } from '../lib/plural'

export const SELECT_DO_DESTINATARIO = {
  id: true,
  email: true,
  companyId: true,
  active: true,
  disabledByAdmin: true,
  accessExpiresAt: true,
  isAdmin: true,
  companyRole: true,
  company: { select: { users: { where: { companyRole: 'OWNER' }, select: { active: true, disabledByAdmin: true, accessExpiresAt: true } } } },
} satisfies Prisma.UserSelect

export interface DestinatarioComEmpresa {
  id: string
  email: string
  companyId: string
  active: boolean
  disabledByAdmin: boolean
  accessExpiresAt: Date | null
  isAdmin: boolean
  companyRole: string
  company: { users: { active: boolean; disabledByAdmin: boolean; accessExpiresAt: Date | null }[] } | null
}

export function acessoDoDestinatarioComEmpresa(destinatario: DestinatarioComEmpresa, agora = Date.now()): AcessoDoDestinatario {
  return acessoDoDestinatario(destinatario, destinatario.company?.users ?? [], agora)
}

export async function licitacoesEsperandoPelaEmpresa(companyId: string): Promise<number> {
  const grupos = await prisma.tenderMatch.groupBy({ by: ['tenderId'], where: { companyId, read: false, tender: whereLicitacaoAberta() } })
  return grupos.length
}

export async function avisarFimDoAcessoUmaVez(destinatario: Pick<DestinatarioComEmpresa, 'id' | 'email' | 'companyId'>, acessoAte: Date): Promise<boolean> {
  const licitacoesEsperando = await licitacoesEsperandoPelaEmpresa(destinatario.companyId)
  if (licitacoesEsperando === 0) return false
  const { count } = await prisma.company.updateMany({
    where: { id: destinatario.companyId, OR: [{ avisoDoFimDoAcesso: null }, { avisoDoFimDoAcesso: { lt: acessoAte } }] },
    data: { avisoDoFimDoAcesso: acessoAte },
  })
  if (count === 0) return false

  const empresa = await prisma.company.findUnique({ where: { id: destinatario.companyId }, select: { planCode: true } })
  await enviarAvisoDeAcessoEncerrado(destinatario.email, { licitacoesEsperando, emTeste: empresa?.planCode === PLANO_DE_TESTE })
  await prisma.notification.create({
    data: {
      userId: destinatario.id,
      type: 'EMAIL',
      title: 'Aviso de acesso encerrado',
      body: `${quantidadeCom(licitacoesEsperando, 'licitação nova esperando', 'licitações novas esperando')} na conta.`,
      sentAt: new Date(),
      metadata: { avisoDoFimDoAcesso: acessoAte.toISOString(), companyId: destinatario.companyId },
    },
  })
  console.log(`[Aviso de acesso encerrado] Enviado para a empresa ${destinatario.companyId}: ${quantidadeCom(licitacoesEsperando, 'licitação esperando', 'licitações esperando')}.`)
  return true
}
