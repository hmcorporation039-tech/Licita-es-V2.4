import { eventoDaMeta } from './medicao'
import { PARAMETROS_UTM, type Utm } from './origemDoAnuncio'

export { utmParaEnvio, type Utm } from './origemDoAnuncio'

const CHAVE_UTM = 'licitacao-platform:utm'

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
    const meta = eventoDaMeta(evento)
    if (meta && typeof janela.fbq === 'function') {
      if ('padrao' in meta) janela.fbq('track', meta.padrao, dados)
      else janela.fbq('trackCustom', meta.personalizado, dados)
    }
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

