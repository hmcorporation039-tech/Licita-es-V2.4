'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { calar, falaDisponivel, falar } from '@/lib/bela'
import { rastrear } from '@/lib/rastreamento'

const APRESENTACAO =
  'Oi, eu sou a Bela, a assistente da Licita Bela. Você me diz o que vende e eu encontro as licitações abertas, pelo prazo mais próximo. Na hora do pregão, eu faço a conta da margem e sugiro o lance. Quem dá o lance é sempre você.'

const VERIFICAR_A_CADA_MS = 300
const assinarNada = () => () => {}
const noServidor = () => false

export default function OuvirABela({ className }: { className?: string }) {
  const disponivel = useSyncExternalStore(assinarNada, falaDisponivel, noServidor)
  const [falando, setFalando] = useState(false)

  useEffect(() => {
    if (!falando) return
    const relogio = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) setFalando(false)
    }, VERIFICAR_A_CADA_MS)
    return () => window.clearInterval(relogio)
  }, [falando])

  useEffect(() => () => calar(), [])

  if (!disponivel) return null

  function alternar() {
    if (falando) {
      calar()
      setFalando(false)
      return
    }
    rastrear('ouvir_bela')
    falar(APRESENTACAO)
    setFalando(true)
  }

  return (
    <button type="button" onClick={alternar} aria-pressed={falando} className={className}>
      {falando ? <Square size={16} strokeWidth={2.5} aria-hidden /> : <Volume2 size={18} strokeWidth={2.25} aria-hidden />}
      {falando ? 'Parar' : 'Ouvir a Bela'}
    </button>
  )
}
