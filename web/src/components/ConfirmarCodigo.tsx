'use client'

// Etapa "digite o código": confirma o e-mail do cadastro com o código de 6 dígitos enviado.
// Com `senha` (logo após o cadastro), a conta entra sozinha depois de confirmada;
// sem ela (quem voltou depois), mostra o caminho para a tela de entrada.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
        } catch {
          /* confirmado, mas o login automático falhou: o usuário entra pela tela de entrada */
        }
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
      <>
        <h1 className="mb-2 text-2xl font-semibold">Acesso confirmado</h1>
        <p className="text-sm text-slate-600">Seu e-mail foi confirmado e o período de teste começou.</p>
        <Link href="/login" className="mt-4 inline-block rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800">
          Entrar
        </Link>
      </>
    )
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Digite o código</h1>
      <p className="text-sm text-slate-600">
        Enviamos um código de 6 dígitos para <strong>{email}</strong>. Digite-o abaixo para confirmar o seu acesso. Ele vale por 15 minutos.
      </p>
      <input
        required
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="rounded border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em]"
        aria-label="Código de confirmação"
      />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}
      <button
        type="submit"
        disabled={enviando || codigo.length !== 6}
        className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
      >
        {enviando ? 'Confirmando...' : 'Confirmar acesso'}
      </button>
      <button type="button" onClick={reenviar} disabled={espera > 0} className="self-start text-sm text-indigo-700 hover:underline disabled:text-slate-400 disabled:no-underline">
        {espera > 0 ? `Reenviar código (${espera}s)` : 'Reenviar código'}
      </button>
      <p className="text-xs text-slate-500">Não chegou? Veja a caixa de spam. Se digitou o e-mail errado, faça o cadastro de novo.</p>
    </form>
  )
}
