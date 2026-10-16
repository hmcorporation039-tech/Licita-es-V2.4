import { prefereMenosMovimento } from './movimento'

export const ID_DA_BUSCA = 'busca'
export const EVENTO_DE_BUSCA = 'entrada:buscar'

export interface PedidoDeBusca {
  termo: string
}

export function irParaBusca({ focar = true }: { focar?: boolean } = {}) {
  const secao = document.getElementById(ID_DA_BUSCA)
  if (!secao) return
  secao.scrollIntoView({ behavior: prefereMenosMovimento() ? 'auto' : 'smooth', block: 'start' })
  if (focar) secao.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true })
}

export function pedirBusca(termo: string) {
  window.dispatchEvent(new CustomEvent<PedidoDeBusca>(EVENTO_DE_BUSCA, { detail: { termo } }))
  irParaBusca({ focar: false })
}
