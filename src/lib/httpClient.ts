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
function createRateLimitedClient(baseURL: string, delayMs = 1200): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30_000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'LicitacaoMonitor/1.0 (plataforma de monitoramento)',
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
