'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { estaNaTela, prefereMenosMovimento } from './movimento'

const LIMIAR_DE_ENTRADA = 0.2

export default function Revelar({ children, className }: { children: ReactNode; className?: string }) {
  const referencia = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const elemento = referencia.current
    if (!elemento || prefereMenosMovimento() || typeof IntersectionObserver === 'undefined' || estaNaTela(elemento)) return
    elemento.dataset.revelar = 'aguardando'
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue
          elemento.dataset.revelar = 'visivel'
          observador.disconnect()
        }
      },
      { threshold: LIMIAR_DE_ENTRADA },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return (
    <div ref={referencia} className={className}>
      {children}
    </div>
  )
}
