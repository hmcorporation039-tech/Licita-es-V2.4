// ============================================================
// lib/httpClient.ts — Cliente HTTP com rate limiting
// Rate limit: 1 req/segundo por domínio (APIs gov)
// ============================================================

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

// Delay simples para respeitar rate limit
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const LIMITE_RESPOSTA_BYTES = 50 * 1024 * 1024
const MAX_TENTATIVAS_EXTRAS = 3
const ESPERA_BASE_MS = 10_000
const ESPERA_MAXIMA_MS = 60_000

type ConfigComTentativas = InternalAxiosRequestConfig & { tentativasExtras?: number }

const PAGINA_DE_LIMITE = /limite\s+de\s+requisi/i

export class LimiteDeRequisicoesExcedido extends Error {
  constructor(origem: string) {
    super(`${origem} devolveu a página de "Limite de requisições excedido"`)
    this.name = 'LimiteDeRequisicoesExcedido'
  }
}

export function ehPaginaDeLimiteDeRequisicoes(corpo: unknown): boolean {
  return typeof corpo === 'string' && PAGINA_DE_LIMITE.test(corpo.slice(0, 20_000))
}

interface OpcoesDoCliente {
  detectarPaginaDeLimite?: boolean
  repetirEmLimiteOuIndisponivel?: boolean
}

export function esperaAntesDeTentarDeNovo(tentativa: number, retryAfter?: string | null): number {
  const segundos = Number(retryAfter)
  if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, ESPERA_MAXIMA_MS)
  return Math.min(ESPERA_BASE_MS * 2 ** (tentativa - 1), ESPERA_MAXIMA_MS)
}

// Cria um cliente axios com delay entre requisições
export function createRateLimitedClient(
  baseURL: string,
  delayMs = 1200,
  // Os coletores de HTML (Novacap/FIEG/SESC GO) sobrescrevem o Accept —
  // os de API (PNCP/ComprasNet) continuam pedindo JSON.
  headers: Record<string, string> = { Accept: 'application/json' },
  opcoes: OpcoesDoCliente = {}
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30_000,
    // Portal comprometido ou lento não pode devolver centenas de MB e derrubar o worker por memória.
    maxContentLength: LIMITE_RESPOSTA_BYTES,
    maxBodyLength: LIMITE_RESPOSTA_BYTES,
    maxRedirects: 3,
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

  async function tentarDeNovo(config: ConfigComTentativas, motivo: string, retryAfter?: string) {
    const tentativa = (config.tentativasExtras ?? 0) + 1
    if (tentativa > MAX_TENTATIVAS_EXTRAS) return undefined
    const espera = esperaAntesDeTentarDeNovo(tentativa, retryAfter)
    console.warn(`[httpClient] ${motivo} — nova tentativa ${tentativa}/${MAX_TENTATIVAS_EXTRAS} em ${Math.round(espera / 1000)}s...`)
    await sleep(espera)
    config.tentativasExtras = tentativa
    return client.request(config)
  }

  client.interceptors.response.use(
    async (res) => {
      if (!opcoes.detectarPaginaDeLimite || !ehPaginaDeLimiteDeRequisicoes(res.data)) return res
      const repetida = await tentarDeNovo(res.config as ConfigComTentativas, 'Página de limite de requisições')
      if (repetida) return repetida
      return Promise.reject(new LimiteDeRequisicoesExcedido(baseURL || String(res.config.url ?? 'servidor')))
    },
    async (err: AxiosError) => {
      const config = err.config as ConfigComTentativas | undefined
      const status = err.response?.status
      if (config && opcoes.repetirEmLimiteOuIndisponivel !== false && (status === 429 || status === 503)) {
        const repetida = await tentarDeNovo(config, `HTTP ${status}`, err.response?.headers?.['retry-after'] as string | undefined)
        if (repetida) return repetida
      }
      return Promise.reject(err)
    }
  )

  return client
}

// Clientes pré-configurados para cada fonte
export const pncpClient = createRateLimitedClient('https://pncp.gov.br/api/consulta', 1200, undefined, { detectarPaginaDeLimite: true })
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
// Exceção documentada: o payload do SEST SENAT passa de 300 MB (ver acima).
sestSenatClient.defaults.maxContentLength = 800 * 1024 * 1024

export const queridoDiarioClient = createRateLimitedClient('https://api.queridodiario.org.br', 1500)
queridoDiarioClient.defaults.timeout = 60_000

export const queridoDiarioArquivosClient = createRateLimitedClient('https://data.queridodiario.ok.org.br', 1000, {
  Accept: 'text/plain',
})
queridoDiarioArquivosClient.defaults.timeout = 60_000
queridoDiarioArquivosClient.defaults.maxContentLength = 8 * 1024 * 1024
queridoDiarioArquivosClient.defaults.maxRedirects = 0

export const senacTransparenciaClient = createRateLimitedClient('https://transparencia.senac.br/service/api', 1200)
senacTransparenciaClient.defaults.timeout = 60_000
senacTransparenciaClient.defaults.maxContentLength = 20 * 1024 * 1024

export const portalDaIndustriaClient = createRateLimitedClient('', 1200, { Accept: 'application/json', 'Accept-Encoding': 'gzip' })
portalDaIndustriaClient.defaults.timeout = 60_000
portalDaIndustriaClient.defaults.maxContentLength = 20 * 1024 * 1024

export const paradigmaDaIndustriaClient = createRateLimitedClient('', 1200, { Accept: 'application/json, text/html;q=0.9, */*;q=0.8' })
paradigmaDaIndustriaClient.defaults.timeout = 60_000

export const sistemaSHtmlClient = createRateLimitedClient('', 1200, HTML_HEADERS)
sistemaSHtmlClient.defaults.timeout = 60_000
sistemaSHtmlClient.defaults.maxContentLength = 20 * 1024 * 1024

export const infraeroClient = createRateLimitedClient('https://licitacao.infraero.gov.br', 1500, { Accept: 'text/html,application/xhtml+xml' })

export const diarioMunicipalClient = createRateLimitedClient('https://www.diariomunicipal.com.br', 2000, HTML_HEADERS)
diarioMunicipalClient.defaults.timeout = 60_000
diarioMunicipalClient.defaults.maxContentLength = 5 * 1024 * 1024
diarioMunicipalClient.defaults.maxRedirects = 0
export const tceCeClient = createRateLimitedClient('https://municipios-licitacoes.tce.ce.gov.br', 1500, HTML_HEADERS)
tceCeClient.defaults.maxContentLength = 5 * 1024 * 1024
export const tceToClient = createRateLimitedClient('https://app.tceto.tc.br', 2000, { Accept: 'application/json' })
tceToClient.defaults.timeout = 60_000
tceToClient.defaults.maxContentLength = 10 * 1024 * 1024
tceToClient.defaults.maxRedirects = 0
infraeroClient.defaults.maxContentLength = 2 * 1024 * 1024
export const tcePiClient = createRateLimitedClient('https://sistemas.tce.pi.gov.br', 2000, HTML_HEADERS)
tcePiClient.defaults.maxContentLength = 5 * 1024 * 1024
export const tceRsClient = createRateLimitedClient('https://dados.tce.rs.gov.br', 3000, { Accept: 'application/zip, */*' })
tceRsClient.defaults.timeout = 60_000
tceRsClient.defaults.maxRedirects = 0
export const famemClient = createRateLimitedClient('https://diariooficial.famem.org.br', 2000, HTML_HEADERS, { repetirEmLimiteOuIndisponivel: false })
famemClient.defaults.timeout = 60_000
famemClient.defaults.maxContentLength = 5 * 1024 * 1024
famemClient.defaults.maxRedirects = 0
