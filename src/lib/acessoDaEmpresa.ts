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
