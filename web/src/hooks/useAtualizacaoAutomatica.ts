'use client'

import { useEffect, useRef } from 'react'

const CINCO_MINUTOS_MS = 5 * 60 * 1000
const INTERVALO_MINIMO_AO_VOLTAR_MS = 30 * 1000

export function useAtualizacaoAutomatica(atualizar: () => void, { ativa = true, intervaloMs = CINCO_MINUTOS_MS }: { ativa?: boolean; intervaloMs?: number } = {}) {
  const atualizarAtual = useRef(atualizar)
  const ultimaAtualizacao = useRef(Date.now())

  useEffect(() => {
    atualizarAtual.current = atualizar
  }, [atualizar])

  useEffect(() => {
    if (!ativa) return
    ultimaAtualizacao.current = Date.now()

    const atualizarAgora = () => {
      ultimaAtualizacao.current = Date.now()
      atualizarAtual.current()
    }

    const aoVoltarParaAAba = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaAtualizacao.current < INTERVALO_MINIMO_AO_VOLTAR_MS) return
      atualizarAgora()
    }

    const relogio = window.setInterval(() => {
      if (document.visibilityState === 'visible') atualizarAgora()
    }, intervaloMs)

    document.addEventListener('visibilitychange', aoVoltarParaAAba)
    window.addEventListener('focus', aoVoltarParaAAba)
    return () => {
      window.clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltarParaAAba)
      window.removeEventListener('focus', aoVoltarParaAAba)
    }
  }, [ativa, intervaloMs])
}
