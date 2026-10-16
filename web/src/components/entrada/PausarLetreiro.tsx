'use client'

import { useState } from 'react'
import { Pause, Play } from 'lucide-react'

export default function PausarLetreiro({ alvo }: { alvo: string }) {
  const [pausado, setPausado] = useState(false)

  function alternar() {
    const proximo = !pausado
    setPausado(proximo)
    document.getElementById(alvo)?.toggleAttribute('data-pausado', proximo)
  }

  return (
    <button type="button" onClick={alternar} aria-pressed={pausado} aria-controls={alvo} className="az-letreiro-pausa">
      {pausado ? <Play size={14} strokeWidth={2.5} aria-hidden /> : <Pause size={14} strokeWidth={2.5} aria-hidden />}
      {pausado ? 'Continuar' : 'Pausar'}
    </button>
  )
}
