export type NivelDeAutomacao = 'confirmar' | 'permitida' | 'vedada'

export interface Portal {
  id: string
  nome: string
  hosts: string[]
  /** Onde a pessoa começa no "portal dentro da Bela" quando a licitação não traz o link do processo. */
  inicio: string
  /** Como o PNCP costuma escrever o nome do portal (plataformaDeOrigem), sem acento e em minúsculas. */
  apelidos: RegExp
  loginComCaptcha: boolean
  automacao: NivelDeAutomacao
  /**
   * Se o portal aceita o navegador da Bela (no servidor). Os portais particulares têm proteção
   * contra navegador automático e recusam (403) venha de onde vier: neles a Bela não tenta o
   * quadro e manda abrir numa aba do Chrome da pessoa, com a extensão. A Bela não disfarça o
   * navegador para passar por essa proteção.
   */
  abreDentroDaBela: boolean
  observacao?: string
}

export const PORTAIS: Portal[] = [
  {
    id: 'COMPRASNET',
    nome: 'Compras.gov.br',
    hosts: ['compras.gov.br', 'comprasnet.gov.br'],
    inicio: 'https://www.comprasnet.gov.br/seguro/loginPortal.asp',
    apelidos: /compras\.?gov|comprasnet|siasg/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    // Testado em 11/2026 com o navegador em São Paulo (Fly.io): abre normalmente.
    abreDentroDaBela: true,
    observacao: 'Login pelo gov.br; automação a validar na sessão real.',
  },
  {
    id: 'PCP',
    nome: 'Portal de Compras Públicas',
    hosts: ['portaldecompraspublicas.com.br'],
    inicio: 'https://www.portaldecompraspublicas.com.br/',
    apelidos: /portal de compras publicas|portaldecompraspublicas/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'LICITACOES_E',
    nome: 'Licitações-e (Banco do Brasil)',
    hosts: ['licitacoes-e.com.br'],
    inicio: 'https://www.licitacoes-e.com.br/aop/index.jsp',
    apelidos: /licitacoes-e|licitacoes e\b|banco do brasil/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'BLL',
    nome: 'BLL — Bolsa de Licitações do Brasil',
    hosts: ['bll.org.br', 'bllcompras.com', 'bllcompras.com.br'],
    inicio: 'https://bll.org.br/',
    apelidos: /\bbll\b|bolsa de licitacoes/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'BNC',
    nome: 'BNC — Bolsa Nacional de Compras',
    hosts: ['bnc.org.br'],
    inicio: 'https://bnc.org.br/',
    apelidos: /\bbnc\b|bolsa nacional de compras/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'LICITAR_DIGITAL',
    nome: 'Licitar Digital',
    hosts: ['licitardigital.com.br', 'ammlicita.org.br'],
    inicio: 'https://licitardigital.com.br/',
    apelidos: /licitar digital|licitardigital|\bamm ?licita/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'LICITANET',
    nome: 'LicitaNet',
    hosts: ['licitanet.com.br'],
    inicio: 'https://licitanet.com.br/',
    apelidos: /licitanet/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'BEC_SP',
    nome: 'BEC/SP — Bolsa Eletrônica de Compras de SP',
    hosts: ['bec.sp.gov.br', 'bec.fazenda.sp.gov.br'],
    inicio: 'https://www.bec.sp.gov.br/',
    apelidos: /\bbec\b|bolsa eletronica de compras/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'COMPRAS_BR',
    nome: 'Compras BR',
    hosts: ['comprasbr.com.br'],
    inicio: 'https://comprasbr.com.br/',
    apelidos: /compras ?br\b|comprasbr/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
  {
    id: 'PUBLINEXO',
    nome: 'Publinexo',
    hosts: ['publinexo.com.br'],
    inicio: 'https://www.publinexo.com.br/',
    apelidos: /publinexo/,
    loginComCaptcha: true,
    automacao: 'confirmar',
    abreDentroDaBela: false,
  },
]

export function portalPorId(id: string): Portal | null {
  return PORTAIS.find((p) => p.id === id) ?? null
}

/** O portal do catálogo a que um host pertence (o próprio domínio ou um subdomínio). */
export function portalDoHost(host: string): Portal | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '')
  if (!h) return null
  return PORTAIS.find((p) => p.hosts.some((d) => h === d || h.endsWith('.' + d))) ?? null
}

function hostDe(url: string | null | undefined): string {
  try {
    return url ? new URL(url).hostname : ''
  } catch {
    return ''
  }
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Em qual portal a licitação acontece: pelo link do processo (quando aponta para um portal
 * do catálogo) ou pelo nome da plataforma que o PNCP informa. null quando não dá para saber.
 */
export function portalDaLicitacao(t: { linkEdital?: string | null; plataformaDeOrigem?: string | null; fonte?: string | null }): Portal | null {
  const peloLink = portalDoHost(hostDe(t.linkEdital))
  if (peloLink) return peloLink
  const nome = semAcento(t.plataformaDeOrigem ?? '')
  if (nome) {
    const pelaPlataforma = PORTAIS.find((p) => p.apelidos.test(nome))
    if (pelaPlataforma) return pelaPlataforma
  }
  return t.fonte === 'COMPRASNET' ? portalPorId('COMPRASNET') : null
}

/** Página inicial do portal para a licitação: o link do processo, se for desse portal; senão o início do portal. */
export function inicioNoPortal(portal: Portal, linkEdital?: string | null): string {
  const link = linkEdital?.trim()
  if (link && link.startsWith('https://') && portalDoHost(hostDe(link))?.id === portal.id) return link
  return portal.inicio
}

/** Todos os domínios dos portais do catálogo (para a navegação do "portal dentro da Bela"). */
export function hostsDosPortais(): string[] {
  return [...new Set(PORTAIS.flatMap((p) => p.hosts))]
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
