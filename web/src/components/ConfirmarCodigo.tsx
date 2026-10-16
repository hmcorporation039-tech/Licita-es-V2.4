'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PublicCard } from '@/components/PublicShell'
import { Button, Field, FormError, Input, LinkButton, Notice } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'
import { setSession, SessionUser } from '@/lib/session'

const ESPERA_REENVIO_S = 60

export default function ConfirmarCodigo({ email, senha }: { email: string; senha?: string }) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [espera, setEspera] = useState(ESPERA_REENVIO_S)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setInfo(null)
    setEnviando(true)
    try {
      await api.post('/api/auth/verify-email', { email, codigo })
      setConfirmado(true)
      if (senha) {
        try {
          const { token, user } = await api.post<{ token: string; user: SessionUser }>('/api/auth/login', { email, password: senha })
          setSession(token, user)
          router.push('/dashboard')
          return
        } catch {}
      }
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível confirmar o código')
      if (err instanceof ApiRequestError && err.code === 'CODIGO_BLOQUEADO') setCodigo('')
    } finally {
      setEnviando(false)
    }
  }

  async function reenviar() {
    setErro(null)
    setInfo(null)
    try {
      await api.post('/api/auth/resend-verification', { email })
      setInfo('Se o e-mail estiver correto, enviamos um novo código.')
      setCodigo('')
      setEspera(ESPERA_REENVIO_S)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Erro ao reenviar o código')
    }
  }

  if (confirmado) {
    return (
      <PublicCard title="Acesso confirmado" description="Seu e-mail foi confirmado e o período de teste começou." fala="Tudo certo! Seu teste começou e eu já estou procurando licitações para você.">
        <LinkButton href="/login" variant="primary" className="pb-cta w-full">
          Entrar
        </LinkButton>
      </PublicCard>
    )
  }

  return (
    <PublicCard
      title="Digite o código"
      fala="Falta pouco. O código de 6 dígitos chegou no seu e-mail."
      description={
        <>
          Enviamos um código de 6 dígitos para <strong className="font-medium text-ink">{email}</strong>. Digite-o abaixo para confirmar o seu
          acesso. Ele vale por 15 minutos.
        </>
      }
    >
      <form onSubmit={confirmar} className="flex flex-col gap-4">
        <Field label="Código de confirmação" required>
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-14! text-center font-mono text-2xl! tracking-[0.5em] indent-[0.5em]"
          />
        </Field>
        <FormError>{erro}</FormError>
        {info && <Notice tone="ok">{info}</Notice>}
        <Button type="submit" variant="primary" loading={enviando} disabled={codigo.length !== 6} className="pb-cta w-full">
          {enviando ? 'Confirmando…' : 'Confirmar acesso'}
        </Button>
        <div className="flex flex-col items-start gap-1.5 border-t border-line-soft pt-4">
          <button
            type="button"
            onClick={reenviar}
            disabled={espera > 0}
            className="text-sm font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
          >
            {espera > 0 ? (
              <>
                Reenviar código <span className="font-mono">({espera}s)</span>
              </>
            ) : (
              'Reenviar código'
            )}
          </button>
          <p className="text-xs text-muted">Não chegou? Veja a caixa de spam. Se digitou o e-mail errado, faça o cadastro de novo.</p>
        </div>
      </form>
    </PublicCard>
  )
}
