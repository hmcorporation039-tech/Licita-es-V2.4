'use client'

import type { MouseEvent, ReactNode } from 'react'
import { rastrear } from '@/lib/rastreamento'
import { ID_DA_BUSCA, pedirBusca } from './buscaDaEntrada'

export default function BuscarNoRamo({ ramo, termo, className, children }: { ramo: string; termo: string; className?: string; children: ReactNode }) {
  const href = `/?${new URLSearchParams({ q: termo }).toString()}#${ID_DA_BUSCA}`

  function aoClicar(evento: MouseEvent<HTMLAnchorElement>) {
    rastrear('clique_ramo', { ramo, termo })
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return
    evento.preventDefault()
    pedirBusca(termo)
  }

  return (
    <a href={href} onClick={aoClicar} className={className}>
      {children}
    </a>
  )
}
