'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PublicShell from '@/components/PublicShell'
import { api, ApiRequestError } from '@/lib/api'
import { setSession } from '@/lib/session'
import { User } from '@/lib/types'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [naoConfirmado, setNaoConfirmado] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setNaoConfirmado(false)
    setLoading(true)
    try {
      const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password })
      setSession(token, user)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao entrar')
      setNaoConfirmado(err instanceof ApiRequestError && err.code === 'EMAIL_NAO_VERIFICADO')
    } finally {
      setLoading(false)
    }
  }

  async function reenviar() {
    setInfo(null)
    try {
      const r = await api.post<{ mensagem: string }>('/api/auth/resend-verification', { email })
      setInfo(r.mensagem)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao reenviar')
    }
  }

  return (
    <PublicShell estreito>
      <h1 className="mb-1 text-2xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-slate-500">
        Não tem conta?{' '}
        <Link href="/cadastro" className="text-indigo-700 hover:underline">
          Crie uma e teste grátis
        </Link>
        .
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="voce@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {naoConfirmado && (
          <>
            <Link href={`/verificar-email?email=${encodeURIComponent(email)}`} className="self-start text-sm text-indigo-700 hover:underline">
              Digitar o código de confirmação
            </Link>
            <button type="button" onClick={reenviar} className="self-start text-sm text-indigo-700 hover:underline">
              Reenviar código
            </button>
          </>
        )}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
        <Link href="/esqueci-senha" className="text-sm text-slate-500 hover:underline">
          Esqueci minha senha
        </Link>
      </form>
    </PublicShell>
  )
}
