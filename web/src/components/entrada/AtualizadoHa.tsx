'use client'

import { useSyncExternalStore } from 'react'
import { formatarData } from '@/lib/datas'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

let instanteDaLeitura: number | null = null
const assinarNada = () => () => {}
const lerInstante = () => (instanteDaLeitura ??= Date.now())
const lerInstanteNoServidor = () => null

function tempoDecorrido(desde: number, agora: number): string {
  const passou = Math.max(0, agora - desde)
  if (passou < MINUTO) return 'agora há pouco'
  if (passou < HORA) {
    const minutos = Math.floor(passou / MINUTO)
    return `há ${minutos} min`
  }
  if (passou < DIA) {
    const horas = Math.floor(passou / HORA)
    return `há ${horas} h`
  }
  const dias = Math.floor(passou / DIA)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

export default function AtualizadoHa({ iso }: { iso: string }) {
  const agora = useSyncExternalStore(assinarNada, lerInstante, lerInstanteNoServidor)
  const instante = new Date(iso).getTime()
  if (Number.isNaN(instante)) return null
  const absoluto = formatarData(iso, { comHora: true })

  return (
    <time dateTime={iso} title={absoluto}>
      {agora === null ? `em ${absoluto}` : tempoDecorrido(instante, agora)}
    </time>
  )
}
