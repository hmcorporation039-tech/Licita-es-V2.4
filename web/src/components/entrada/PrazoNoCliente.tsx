'use client'

import { useSyncExternalStore } from 'react'
import { Prazo } from '@/components/ui'
import { formatarData, paraData } from '@/lib/datas'

const assinarNada = () => () => {}
const noCliente = () => true
const noServidor = () => false

export default function PrazoNoCliente({ prazo }: { prazo: string | null }) {
  const hidratado = useSyncExternalStore(assinarNada, noCliente, noServidor)
  const data = paraData(prazo)

  if (!data) return <span className="text-xs text-muted">Data no edital</span>
  if (!hidratado) return <span className="whitespace-nowrap font-mono text-xs text-muted">{formatarData(prazo)}</span>
  if (data.getTime() < Date.now()) return <span className="text-xs text-muted">Data no edital</span>
  return <Prazo data={prazo} />
}
