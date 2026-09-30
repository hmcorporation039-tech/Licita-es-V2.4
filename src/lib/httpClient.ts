// ============================================================
// lib/httpClient.ts — Cliente HTTP com rate limiting
// Rate limit: 1 req/segundo por domínio (APIs gov)
// ============================================================

import axios, { AxiosInstance } from 'axios'

// Delay simples para respeitar rate limit
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Cria um cliente axios com delay entre requisições
function createRateLimitedClient(
  baseURL: string,
  delayMs = 1200,
  // Os coletores de HTML (Novacap/FIEG/SESC GO) sobrescrevem o Accept —
  // os de API (PNCP/ComprasNet) continuam pedindo JSON.
  headers: Record<string, string> = { Accept: 'application/json' }
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30_000,
    headers: {
      'User-Agent': 'LicitacaoMonitor/1.0 (plataforma de monitoramento)',
      ...headers,
    },
  })

  let lastCallAt = 0

  client.interceptors.request.use(async (config) => {
    const now = Date.now()
    const elapsed = now - lastCallAt
    if (elapsed < delayMs) {
      await sleep(delayMs - elapsed)
    }
    lastCallAt = Date.now()
    return config
  })

  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      // Retry automático em 429 (too many requests) ou 503
      if (err.response?.status === 429 || err.response?.status === 503) {
        console.warn('[httpClient] Rate limit atingido — aguardando 10s...')
        await sleep(10_000)
        return client.request(err.config)
      }
      return Promise.reject(err)
    }
  )

  return client
}

// Clientes pré-configurados para cada fonte
export const pncpClient = createRateLimitedClient('https://pncp.gov.br/api/consulta')
export const comprasnetClient = createRateLimitedClient('https://dadosabertos.compras.gov.br')
export const comprasLegacyClient = createRateLimitedClient('https://compras.dados.gov.br')

// Fontes que devolvem HTML (raspagem) em vez de JSON — Accept pedindo HTML
// e um User-Agent de navegador real: alguns desses sites bloqueiam clientes
// que não parecem browser, mesmo em página pública sem login.
const HTML_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
}

export const novacapClient = createRateLimitedClient('https://app.novacap.df.gov.br/sislicitapublica', 1500, HTML_HEADERS)
export const fiegClient = createRateLimitedClient('https://www.sistemafieg.org.br', 1500, HTML_HEADERS)
export const sescGoClient = createRateLimitedClient('https://www3.sescgo.com.br', 1500, HTML_HEADERS)

// Departamentos Regionais do SESC (exceto GO): cada unidade tem um site próprio,
// então este cliente não tem baseURL — o coletor passa a URL completa de cada
// página (ver services/sescRegional/). O intervalo entre requisições é global
// do cliente, o que espaça também as idas a sites diferentes.
export const sescRegionalClient = createRateLimitedClient('', 1500, HTML_HEADERS)

// SEST SENAT — API JSON real (Angular por trás), mas devolve o histórico
// nacional inteiro numa chamada só (sem filtro de ano que funcione no
// servidor — testado, ignorado) e às vezes embute byte de controle bruto
// (\u0000) no meio de string, que quebra o JSON.parse automático do axios.
// Por isso timeout maior e Content-Type próprio; o parse manual (com limpeza
// desses bytes) fica no parser, não aqui.
//
// O payload é grande de verdade: medido em 2026-09-28, só a empresa SEST
// já é ~320 MB e leva perto de 100s pra baixar numa conexão comum — 120s
// de timeout quase estourou num teste real. 5min dá folga de sobra.
export const sestSenatClient = createRateLimitedClient(
  'https://transparencia.sestsenat.org.br/api',
  1500,
  { Accept: 'application/json', 'Content-Type': 'application/json' }
)
sestSenatClient.defaults.timeout = 300_000
