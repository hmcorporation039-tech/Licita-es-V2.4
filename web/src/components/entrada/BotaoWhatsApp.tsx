'use client'

import { MessageCircle } from 'lucide-react'
import { rastrear } from '@/lib/rastreamento'

const MENSAGEM_INICIAL = 'Olá! Quero saber mais sobre o Monitor de Licitações.'

export function linkDoWhatsApp(numero: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(MENSAGEM_INICIAL)}`
}

export function LinkDoWhatsApp({ numero, origem, className, children }: { numero: string; origem: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={linkDoWhatsApp(numero)} target="_blank" rel="noopener noreferrer" onClick={() => rastrear('clique_whatsapp', { origem })} className={className}>
      <MessageCircle size={18} strokeWidth={2.25} aria-hidden className="shrink-0" />
      {children}
    </a>
  )
}

export default function BotaoWhatsApp({ numero }: { numero: string }) {
  return (
    <a
      href={linkDoWhatsApp(numero)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar pelo WhatsApp (abre em nova aba)"
      onClick={() => rastrear('clique_whatsapp', { origem: 'flutuante' })}
      className="az-whats"
    >
      <MessageCircle size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span className="az-whats-rotulo">WhatsApp</span>
    </a>
  )
}
