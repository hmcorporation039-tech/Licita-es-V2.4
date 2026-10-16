'use client'

import { useEffect, useRef, useState } from 'react'
import { estaNaTela, prefereMenosMovimento } from './movimento'

const DURACAO_MS = 1400

function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function NumeroQueSobe({ valor, casas = 0, sufixo = '', atrasoMs = 0, className }: { valor: number; casas?: number; sufixo?: string; atrasoMs?: number; className?: string }) {
  const referencia = useRef<HTMLSpanElement>(null)
  const [exibido, setExibido] = useState(valor)

  useEffect(() => {
    const elemento = referencia.current
    if (!elemento || prefereMenosMovimento() || typeof IntersectionObserver === 'undefined' || estaNaTela(elemento)) return
    let quadro = 0
    let espera = 0
    setExibido(0)
    const animar = () => {
      const inicio = performance.now()
      const passo = (agora: number) => {
        const progresso = Math.min(1, (agora - inicio) / DURACAO_MS)
        setExibido(valor * suavizar(progresso))
        if (progresso < 1) quadro = requestAnimationFrame(passo)
      }
      quadro = requestAnimationFrame(passo)
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return
        observador.disconnect()
        espera = window.setTimeout(animar, atrasoMs)
      },
      { threshold: 0.5 },
    )
    observador.observe(elemento)
    return () => {
      observador.disconnect()
      window.clearTimeout(espera)
      cancelAnimationFrame(quadro)
      setExibido(valor)
    }
  }, [valor, atrasoMs])

  return (
    <span ref={referencia} className={className}>
      {exibido.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}
      {sufixo}
    </span>
  )
}
