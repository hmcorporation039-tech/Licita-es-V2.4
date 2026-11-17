'use client'

// Partes da medição que mexem no navegador (window/document). A lógica pura fica em medicao.ts.

import { EVENTO_REABRIR, VALOR_DO_CADASTRO_EM_REAIS, conversaoDoAds, guardarEscolha as guardar, lerEscolha as ler, type EscolhaDeMedicao } from './medicao'

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
  const ads = conversaoDoAds()
  if (ads) janela.gtag('config', ads.conta)
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

/**
 * Conversão "Cadastro — teste grátis" no Google Ads, depois do e-mail confirmado.
 * Só sai se a pessoa aceitou a medição (sem aceite, o gtag nem existe na página).
 * O id do usuário evita contar duas vezes; nenhum dado pessoal vai junto.
 */
export function registrarConversaoDoCadastro(idDoUsuario: string | undefined): void {
  if (typeof window === 'undefined') return
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

/** Para o rodapé ou a Política de Privacidade: mostra o aviso de novo. */
export function reabrirEscolha(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_REABRIR))
}
