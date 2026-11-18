const CHAVE_UTM = 'licitacao-platform:utm'
const PARAMETROS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid'] as const

const IDS_DO_CLIQUE_NO_ANUNCIO = new Set<string>(['gclid', 'gbraid', 'wbraid'])

type ParametroUtm = (typeof PARAMETROS_UTM)[number]
export type Utm = Partial<Record<ParametroUtm, string>> & { capturadoEm?: string }

type JanelaComRastreadores = Window & {
  dataLayer?: Array<Record<string, unknown>>
  fbq?: (...args: unknown[]) => void
  gtag?: (...args: unknown[]) => void
}

export function rastrear(evento: string, dados: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const janela = window as JanelaComRastreadores
  try {
    if (Array.isArray(janela.dataLayer)) janela.dataLayer.push({ event: evento, ...dados })
    if (typeof janela.fbq === 'function') janela.fbq('trackCustom', evento, dados)
    if (typeof janela.gtag === 'function') janela.gtag('event', evento, dados)
  } catch {}
}

export function guardarUtm() {
  if (typeof window === 'undefined') return
  try {
    const busca = new URLSearchParams(window.location.search)
    const utm: Utm = {}
    for (const parametro of PARAMETROS_UTM) {
      const valor = busca.get(parametro)?.trim()
      if (valor) utm[parametro] = valor.slice(0, 200)
    }
    if (Object.keys(utm).length === 0) return
    utm.capturadoEm = new Date().toISOString()
    window.localStorage.setItem(CHAVE_UTM, JSON.stringify(utm))
  } catch {}
}

export function lerUtm(): Utm | null {
  if (typeof window === 'undefined') return null
  try {
    const bruto = window.localStorage.getItem(CHAVE_UTM)
    return bruto ? (JSON.parse(bruto) as Utm) : null
  } catch {
    return null
  }
}

/**
 * O que vai junto no cadastro para saber de onde a pessoa veio.
 *
 * O identificador do clique no anúncio (gclid/gbraid/wbraid) só vai se a pessoa aceitou a
 * medição do Google (LGPD). Mas quem chegou por um anúncio do Google e recusou continua
 * contando como Google no Funil: sem o identificador, vai só "google / cpc", que não
 * identifica ninguém. Sem isso, todo clique pago de quem recusa aparecia como "direto".
 */
export function utmParaEnvio(utm: Utm | null, aceitouMedicao: boolean): Partial<Record<ParametroUtm, string>> | undefined {
  if (!utm) return undefined
  const envio: Partial<Record<ParametroUtm, string>> = {}
  for (const chave of PARAMETROS_UTM) {
    if (!aceitouMedicao && IDS_DO_CLIQUE_NO_ANUNCIO.has(chave)) continue
    const valor = utm[chave]
    if (typeof valor === 'string' && valor.trim()) envio[chave] = valor.trim().slice(0, 200)
  }
  const veioDeAnuncioDoGoogle = [...IDS_DO_CLIQUE_NO_ANUNCIO].some((chave) => typeof utm[chave as ParametroUtm] === 'string' && utm[chave as ParametroUtm]!.trim())
  if (veioDeAnuncioDoGoogle && !envio.utm_source) {
    envio.utm_source = 'google'
    envio.utm_medium ??= 'cpc'
  }
  return Object.keys(envio).length > 0 ? envio : undefined
}
