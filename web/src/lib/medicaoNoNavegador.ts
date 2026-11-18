'use client'

// Partes da medição que mexem no navegador (window/document). A lógica pura fica em medicao.ts.

import {
  EVENTO_REABRIR,
  VALOR_DO_CADASTRO_EM_REAIS,
  conversaoDoAds,
  guardarEscolha as guardar,
  lerEscolha as ler,
  valorDoCookieFbc,
  type EscolhaDeMedicao,
} from './medicao'
import type { Utm } from './origemDoAnuncio'

function armazenamento(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const lerEscolha = (): EscolhaDeMedicao | null => ler(armazenamento())
export const guardarEscolha = (escolha: EscolhaDeMedicao): void => guardar(escolha, armazenamento())

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string; disablePushState?: boolean }
type JanelaComGtag = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; fbq?: Fbq; _fbq?: Fbq }

/** Carrega o gtag.js do Google uma vez só. Só chame depois do "Aceitar". */
export function ligarMedicao(id: string): void {
  if (typeof window === 'undefined') return
  const janela = window as JanelaComGtag
  if (typeof janela.gtag === 'function') return
  janela.dataLayer = janela.dataLayer ?? []
  janela.gtag = function gtag() {
    // O gtag.js espera o objeto `arguments`, não um array.
    // eslint-disable-next-line prefer-rest-params
    janela.dataLayer!.push(arguments)
  }
  janela.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'denied',
  })
  janela.gtag('js', new Date())
  janela.gtag('config', id)
  const ads = conversaoDoAds()
  if (ads) janela.gtag('config', ads.conta)
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

/**
 * Conversão "Cadastro — teste grátis" no Google Ads e na Meta, depois do e-mail confirmado.
 * Só sai se a pessoa aceitou a medição (sem aceite, o gtag nem existe na página).
 * O id do usuário evita contar duas vezes; nenhum dado pessoal vai junto.
 */
export function registrarConversaoDoCadastro(idDoUsuario: string | undefined): void {
  if (typeof window === 'undefined') return
  registrarCadastroNaMeta(idDoUsuario)
  const janela = window as JanelaComGtag
  const ads = conversaoDoAds()
  if (!ads || typeof janela.gtag !== 'function') return
  try {
    janela.gtag('event', 'conversion', {
      send_to: ads.enviarPara,
      value: VALOR_DO_CADASTRO_EM_REAIS,
      currency: 'BRL',
      ...(idDoUsuario ? { transaction_id: idDoUsuario } : {}),
    })
  } catch {}
}

/** "Cadastro concluído" na Meta. Só sai se o pixel foi ligado (aceite + página pública). */
function registrarCadastroNaMeta(idDoUsuario: string | undefined): void {
  const janela = window as JanelaComGtag
  if (typeof janela.fbq !== 'function') return
  try {
    janela.fbq('track', 'CompleteRegistration', { value: VALOR_DO_CADASTRO_EM_REAIS, currency: 'BRL' }, idDoUsuario ? { eventID: `cadastro-${idDoUsuario}` } : undefined)
  } catch {}
}

/**
 * Carrega o Pixel da Meta uma vez só. Só chame depois do "Aceitar" e numa página pública.
 * Sem eventos automáticos (autoConfig) e sem PageView sozinho a cada troca de página
 * (disablePushState): a página vista é mandada por paginaVistaNaMeta, só nas páginas públicas.
 */
export function ligarPixelDaMeta(id: string, utm: Utm | null): void {
  if (typeof window === 'undefined') return
  const janela = window as JanelaComGtag
  if (typeof janela.fbq === 'function') return
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue!.push(args)
  } as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  fbq.disablePushState = true
  janela.fbq = fbq
  janela._fbq = fbq
  // Quem chegou por um anúncio e só aceitou depois: o fbclid já saiu do endereço.
  const fbc = valorDoCookieFbc(utm?.fbclid, utm?.capturadoEm)
  if (fbc && !/(?:^|;\s*)_fbc=/.test(document.cookie)) {
    document.cookie = `_fbc=${fbc}; path=/; max-age=${90 * 24 * 60 * 60}; SameSite=Lax; Secure`
  }
  fbq('set', 'autoConfig', false, id)
  fbq('init', id)
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)
}

export function paginaVistaNaMeta(): void {
  if (typeof window === 'undefined') return
  const janela = window as JanelaComGtag
  try {
    janela.fbq?.('track', 'PageView')
  } catch {}
}

/** Para o rodapé ou a Política de Privacidade: mostra o aviso de novo. */
export function reabrirEscolha(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_REABRIR))
}
