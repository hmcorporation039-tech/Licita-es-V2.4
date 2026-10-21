'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { replaceSessionToken } from '@/lib/session'
import { registrarConfirmacaoDoSegundoFator } from '@/lib/segundoFator'
import { Button, FormError } from '@/components/ui'
import { CampoDoCodigo } from './LoginEmDuasEtapas'

export default function ConfirmacaoDoSegundoFator() {
  const ref = useRef<HTMLDialogElement>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const [aberto, setAberto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(
    () =>
      registrarConfirmacaoDoSegundoFator(
        () =>
          new Promise<boolean>((resolve) => {
            resolver.current?.(false)
            resolver.current = resolve
            setCodigo('')
            setErro(null)
            setAberto(true)
          })
      ),
    []
  )

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberto && !dialogo.open) dialogo.showModal()
    if (!aberto && dialogo.open) dialogo.close()
  }, [aberto])

  function fechar(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setAberto(false)
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const { token } = await api.post<{ token: string }>('/api/segundo-fator/confirmar', { codigo })
      replaceSessionToken(token)
      fechar(true)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível confirmar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        fechar(false)
      }}
      aria-labelledby="confirmacao-segundo-fator-titulo"
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-cartao-alto"
    >
      {aberto && (
        <form onSubmit={confirmar} className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="confirmacao-segundo-fator-titulo" className="text-lg font-bold">
              Confirme com o código do aplicativo
            </h2>
            <p className="text-sm text-ink-2">Esta ação mexe com dinheiro ou com o acesso de clientes. Depois de confirmar, você não precisa digitar de novo pelos próximos 15 minutos.</p>
          </div>
          <CampoDoCodigo valor={codigo} onChange={setCodigo} autoFocus />
          <FormError>{erro}</FormError>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => fechar(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" icon={ShieldCheck} loading={enviando} disabled={enviando || codigo.trim().length < 6}>
              Confirmar
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
