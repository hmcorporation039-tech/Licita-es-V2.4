'use client'

import { useSyncExternalStore } from 'react'
import { Clock } from 'lucide-react'
import { textoDoPrazo, tomDoPrazo } from '@/components/ui'
import { formatarData, instanteDoPrazo } from '@/lib/datas'

const assinarNada = () => () => {}
const noCliente = () => true
const noServidor = () => false

export function useHidratado(): boolean {
  return useSyncExternalStore(assinarNada, noCliente, noServidor)
}

export default function PrazoNoCliente({ prazo }: { prazo: string | null }) {
  const hidratado = useHidratado()
  const data = instanteDoPrazo(prazo)

  if (!data) return <span className="az-prazo">Data no edital</span>
  if (!hidratado) return <span className="az-prazo">até {formatarData(prazo)}</span>
  if (data.getTime() < Date.now()) return <span className="az-prazo">Data no edital</span>
  const tom = tomDoPrazo(data)
  return (
    <span className={`az-prazo az-prazo-${tom}`} title={`Encerra em ${formatarData(prazo, { comHora: true })}`}>
      {tom === 'danger' && <Clock size={12} strokeWidth={2.5} aria-hidden />}
      encerra {textoDoPrazo(data)}
    </span>
  )
}
