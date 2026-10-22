export const API_BASE = 'https://api-production-4375e.up.railway.app'

export const APP_HOSTS = ['licitabela.com.br', 'licita-es-v2-4.vercel.app', 'localhost']

export const CHAVE_DO_TOKEN_NO_APP = 'licitacao-platform:token'

export const PORTAIS = [
  {
    nome: 'Compras.gov.br',
    hosts: ['compras.gov.br', 'comprasnet.gov.br'],
    seletoresDoMelhorLance: [
      '[id*="melhorLance" i]',
      '[id*="menorLance" i]',
      '[class*="melhor-lance" i]',
      '[class*="menor-lance" i]',
      '[data-melhor-lance]',
    ],
  },
]

export function portalDoHost(host) {
  const h = (host || '').toLowerCase()
  return PORTAIS.find((p) => p.hosts.some((d) => h === d || h.endsWith('.' + d))) ?? null
}

export function ehHostDoApp(host) {
  const h = (host || '').toLowerCase()
  return APP_HOSTS.some((d) => h === d || h.endsWith('.' + d))
}
