'use client'

// Partes da medição que mexem no navegador (window/document). A lógica pura fica em medicao.ts.

import { EVENTO_REABRIR, guardarEscolha as guardar, lerEscolha as ler, type EscolhaDeMedicao } from './medicao'

function armazenamento(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const lerEscolha = (): EscolhaDeMedicao | null => ler(armazenamento())
export const guardarEscolha = (escolha: EscolhaDeMedicao): void => guardar(escolha, armazenamento())

type JanelaComGtag = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }

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
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

/** Para o rodapé ou a Política de Privacidade: mostra o aviso de novo. */
export function reabrirEscolha(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_REABRIR))
}
