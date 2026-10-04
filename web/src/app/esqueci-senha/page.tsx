'use client'

import Link from 'next/link'
import { useState } from 'react'
import PublicShell from '@/components/PublicShell'
import { api, ApiRequestError } from '@/lib/api'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = await api.post<{ mensagem: string }>('/api/auth/forgot-password', { email })
      setMensagem(r.mensagem)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Erro ao enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PublicShell estreito>
      <h1 className="mb-1 text-2xl font-semibold">Esqueci minha senha</h1>
      <p className="mb-5 text-sm text-slate-500">Informe o e-mail da conta e enviaremos um link para escolher uma nova senha.</p>
      {mensagem ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensagem}</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
      )}
      <Link href="/login" className="mt-4 inline-block text-sm text-slate-500 hover:underline">
        ← Voltar para entrar
      </Link>
    </PublicShell>
  )
}
