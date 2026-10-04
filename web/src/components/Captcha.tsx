'use client'

// Captcha Cloudflare Turnstile no cadastro. Só aparece quando
// NEXT_PUBLIC_TURNSTILE_SITE_KEY está configurada (a API confere com TURNSTILE_SECRET_KEY).

import { useEffect, useRef } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
    }
  }
}

export const captchaAtivo = !!SITE_KEY

export default function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY || !caixa.current) return
    const alvo = caixa.current
    let widget: string | undefined
    const desenhar = () => {
      if (!window.turnstile || widget) return
      widget = window.turnstile.render(alvo, {
        sitekey: SITE_KEY,
        language: 'pt-br',
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      })
    }
    if (window.turnstile) {
      desenhar()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = desenhar
    document.head.appendChild(s)
  }, [onToken])

  if (!SITE_KEY) return null
  return <div ref={caixa} className="min-h-[65px]" />
}
