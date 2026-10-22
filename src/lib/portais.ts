export type NivelDeAutomacao = 'confirmar' | 'permitida' | 'vedada'

export interface Portal {
  id: string
  nome: string
  hosts: string[]
  loginComCaptcha: boolean
  automacao: NivelDeAutomacao
  observacao?: string
}

export const PORTAIS: Portal[] = [
  {
    id: 'COMPRASNET',
    nome: 'Compras.gov.br',
    hosts: ['compras.gov.br', 'comprasnet.gov.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
    observacao: 'Login pelo gov.br; automação a validar na sessão real.',
  },
  {
    id: 'PCP',
    nome: 'Portal de Compras Públicas',
    hosts: ['portaldecompraspublicas.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'LICITACOES_E',
    nome: 'Licitações-e (Banco do Brasil)',
    hosts: ['licitacoes-e.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'BLL',
    nome: 'BLL — Bolsa de Licitações do Brasil',
    hosts: ['bll.org.br', 'bllcompras.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'BNC',
    nome: 'BNC — Bolsa Nacional de Compras',
    hosts: ['bnc.org.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'LICITAR_DIGITAL',
    nome: 'Licitar Digital',
    hosts: ['licitardigital.com.br', 'ammlicita.org.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'LICITANET',
    nome: 'LicitaNet',
    hosts: ['licitanet.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'BEC_SP',
    nome: 'BEC/SP — Bolsa Eletrônica de Compras de SP',
    hosts: ['bec.sp.gov.br', 'bec.fazenda.sp.gov.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'COMPRAS_BR',
    nome: 'Compras BR',
    hosts: ['comprasbr.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
  {
    id: 'PUBLINEXO',
    nome: 'Publinexo',
    hosts: ['publinexo.com.br'],
    loginComCaptcha: true,
    automacao: 'confirmar',
  },
]

export function portalPorId(id: string): Portal | null {
  return PORTAIS.find((p) => p.id === id) ?? null
}

export function idsDePortais(): string[] {
  return PORTAIS.map((p) => p.id)
}

export function mascararLogin(login: string): string {
  const texto = login.trim()
  if (texto.length <= 2) return '•'.repeat(texto.length)
  if (texto.includes('@')) {
    const [nome, dominio] = texto.split('@')
    return `${nome.slice(0, 2)}${'•'.repeat(Math.max(1, nome.length - 2))}@${dominio}`
  }
  return `${texto.slice(0, 2)}${'•'.repeat(Math.max(1, texto.length - 3))}${texto.slice(-1)}`
}
