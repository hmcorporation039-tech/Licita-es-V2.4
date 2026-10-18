export interface DonoParaAcesso {
  active: boolean
  disabledByAdmin: boolean
  accessExpiresAt: Date | null
}

export function empresaTemDonoComAcesso(donos: DonoParaAcesso[], agora = Date.now()): boolean {
  return donos.some(
    (dono) => dono.active && !dono.disabledByAdmin && (!dono.accessExpiresAt || dono.accessExpiresAt.getTime() >= agora)
  )
}

export interface DestinatarioDeAviso extends DonoParaAcesso {
  isAdmin: boolean
  companyRole: string
}

export type AcessoDoDestinatario = { situacao: 'ativo' } | { situacao: 'encerrado'; acessoAte: Date } | { situacao: 'bloqueado' }

function ultimoPrazoVencido(donos: DonoParaAcesso[], agora: number): Date | null {
  const vencidos = donos.flatMap((dono) =>
    dono.active && !dono.disabledByAdmin && dono.accessExpiresAt && dono.accessExpiresAt.getTime() < agora ? [dono.accessExpiresAt.getTime()] : []
  )
  return vencidos.length === 0 ? null : new Date(Math.max(...vencidos))
}

export function acessoDoDestinatario(usuario: DestinatarioDeAviso, donos: DonoParaAcesso[], agora = Date.now()): AcessoDoDestinatario {
  if (!usuario.active || usuario.disabledByAdmin) return { situacao: 'bloqueado' }
  if (usuario.accessExpiresAt && usuario.accessExpiresAt.getTime() < agora) return { situacao: 'encerrado', acessoAte: usuario.accessExpiresAt }
  if (usuario.isAdmin || usuario.companyRole === 'OWNER' || empresaTemDonoComAcesso(donos, agora)) return { situacao: 'ativo' }
  const prazoDosDonos = ultimoPrazoVencido(donos, agora)
  return prazoDosDonos ? { situacao: 'encerrado', acessoAte: prazoDosDonos } : { situacao: 'bloqueado' }
}
