'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

interface Pedido {
  titulo: ReactNode
  mensagem?: ReactNode
  confirmarRotulo?: string
  cancelarRotulo?: string
  perigo?: boolean
  apenasOk?: boolean
}

export function useDialogo() {
  const ref = useRef<HTMLDialogElement>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (pedido && !dialogo.open) dialogo.showModal()
    if (!pedido && dialogo.open) dialogo.close()
  }, [pedido])

  const fechar = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setPedido(null)
  }, [])

  const abrir = useCallback((p: Pedido) => {
    resolver.current?.(false)
    setPedido(p)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const confirmar = useCallback((p: Omit<Pedido, 'apenasOk'>) => abrir(p), [abrir])
  const avisar = useCallback((p: Omit<Pedido, 'apenasOk' | 'cancelarRotulo' | 'perigo'>) => abrir({ ...p, apenasOk: true }).then(() => undefined), [abrir])

  const dialogo = (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        fechar(false)
      }}
      aria-labelledby="dialogo-titulo"
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded border border-line bg-surface p-0 text-ink shadow-[0_8px_24px_rgb(26_28_31/0.12)]"
    >
      {pedido && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="dialogo-titulo" className="text-lg font-semibold">
              {pedido.titulo}
            </h2>
            {pedido.mensagem && <div className="text-sm text-ink-2">{pedido.mensagem}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!pedido.apenasOk && (
              <Button variant="secondary" onClick={() => fechar(false)}>
                {pedido.cancelarRotulo ?? 'Cancelar'}
              </Button>
            )}
            <Button variant={pedido.perigo ? 'danger' : 'primary'} onClick={() => fechar(true)} autoFocus>
              {pedido.confirmarRotulo ?? (pedido.apenasOk ? 'Entendi' : 'Confirmar')}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )

  return { confirmar, avisar, dialogo }
}
