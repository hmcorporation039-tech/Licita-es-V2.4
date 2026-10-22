import type { NivelDeAutomacao } from '../../lib/portais'

export interface CredencialDePortal {
  login: string
  senha: string
}

export interface SessaoDePortal {
  portalId: string
  companyId: string
  autenticadaEm: Date
}

export interface SituacaoDaDisputa {
  melhorLance: number | null
  encerrada: boolean
}

export type MotivoIndisponivel = 'CAPTCHA' | 'VEDADA' | 'SESSAO_REAL_PENDENTE'

export class AutomacaoNaoDisponivel extends Error {
  readonly portalId: string
  readonly motivo: MotivoIndisponivel

  constructor(portalId: string, motivo: MotivoIndisponivel, mensagem: string) {
    super(mensagem)
    this.name = 'AutomacaoNaoDisponivel'
    this.portalId = portalId
    this.motivo = motivo
  }
}

export interface AdaptadorDePortal {
  readonly portalId: string
  readonly automacao: NivelDeAutomacao
  readonly loginComCaptcha: boolean
  entrar(companyId: string, credencial: CredencialDePortal): Promise<SessaoDePortal>
  lerMelhorLance(sessao: SessaoDePortal, alvo: string): Promise<SituacaoDaDisputa>
  darLance(sessao: SessaoDePortal, alvo: string, valor: number): Promise<void>
}
