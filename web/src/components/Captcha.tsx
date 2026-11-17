'use client'

import { useEffect, useRef, useState } from 'react'
import { API_URL } from '@/lib/api'

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

// Avisa a equipe (uma vez por página) que o captcha falhou no navegador do visitante.
// Um erro de configuração (ex.: domínio fora da lista da Cloudflare) impede todo
// cadastro; sem este aviso, só se descobria quando alguém reclamava.
let avisado = false
function avisarFalha(codigo: string) {
  if (avisado) return
  avisado = true
  try {
    void fetch(`${API_URL}/api/public/aviso-do-cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'captcha', codigo: String(codigo).slice(0, 20), endereco: window.location.host + window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {}
}

export default function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    if (!SITE_KEY || !caixa.current) return
    const alvo = caixa.current
    let widget: string | undefined
    const desenhar = () => {
      if (!window.turnstile || widget) return
      widget = window.turnstile.render(alvo, {
        sitekey: SITE_KEY,
        language: 'pt-br',
        callback: (t: string) => {
          setFalhou(false)
          onToken(t)
        },
        'expired-callback': () => onToken(null),
        // Não devolve nada: o Turnstile continua tentando sozinho.
        'error-callback': (codigo: string) => {
          onToken(null)
          setFalhou(true)
          avisarFalha(codigo)
        },
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
  return (
    <div>
      <div ref={caixa} className="min-h-[65px]" />
      {falhou && (
        <p role="alert" className="mt-1 text-sm text-danger">
          A verificação anti-robô não carregou. Recarregue a página; se continuar, desative bloqueadores de anúncio ou tente pelo celular. Nossa equipe já foi avisada.
        </p>
      )}
    </div>
  )
}
