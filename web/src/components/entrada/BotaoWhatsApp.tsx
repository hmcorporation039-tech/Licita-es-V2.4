'use client'

import { MessageCircle } from 'lucide-react'
import { rastrear } from '@/lib/rastreamento'

const MENSAGEM_INICIAL = 'Olá! Quero saber mais sobre o Monitor de Licitações.'

export default function BotaoWhatsApp({ numero }: { numero: string }) {
  const href = `https://wa.me/${numero}?text=${encodeURIComponent(MENSAGEM_INICIAL)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar pelo WhatsApp (abre em nova aba)"
      onClick={() => rastrear('clique_whatsapp')}
      className="acima-da-barra-fixa fixed right-4 z-40 inline-flex h-12 items-center gap-2 rounded border border-ok bg-ok px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:right-6"
    >
      <MessageCircle size={18} strokeWidth={2} aria-hidden />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  )
}
