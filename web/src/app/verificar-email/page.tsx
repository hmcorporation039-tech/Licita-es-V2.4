'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import PublicShell from '@/components/PublicShell'
import { api, ApiRequestError } from '@/lib/api'

export default function VerificarEmailPage() {
  return (
    <PublicShell estreito>
      <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </PublicShell>
  )
}

function Conteudo() {
  const token = useSearchParams().get('token')
  const [estado, setEstado] = useState<'senha' | 'confirmando' | 'ok' | 'erro'>(token ? 'senha' : 'erro')
  const [mensagem, setMensagem] = useState(token ? '' : 'Link incompleto. Abra o link do e-mail de confirmação.')
  const [senha, setSenha] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)

  // A confirmação pede a senha escolhida no cadastro: assim, se alguém cadastrou o seu
  // e-mail sem você saber, você não ativa a conta dessa pessoa ao clicar no link.
  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('confirmando')
    setErroSenha(null)
    try {
      await api.post('/api/auth/verify-email', { token, senha })
      setEstado('ok')
    } catch (err) {
      if (err instanceof ApiRequestError && /senha/i.test(err.message)) {
        setErroSenha(err.message)
        setEstado('senha')
        return
      }
      setEstado('erro')
      setMensagem(err instanceof ApiRequestError ? err.message : 'Não foi possível confirmar o e-mail.')
    }
  }

  if (estado === 'senha') {
    return (
      <form onSubmit={confirmar}>
        <h1 className="mb-2 text-2xl font-semibold">Confirme seu e-mail</h1>
        <p className="mb-4 text-sm text-slate-600">
          Para ativar a conta, digite a senha que você escolheu no cadastro. Se você não se cadastrou, ignore este link.
        </p>
        <label className="block text-sm font-medium text-slate-700" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {erroSenha && <p className="mt-2 text-sm text-red-600">{erroSenha}</p>}
        <button type="submit" className="mt-4 rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800">
          Confirmar e ativar
        </button>
        <p className="mt-4 text-xs text-slate-500">
          Esqueceu a senha? Faça o cadastro de novo com o mesmo e-mail: o cadastro pendente é substituído e um novo link é enviado.
        </p>
      </form>
    )
  }

  if (estado === 'confirmando') return <p className="text-sm text-slate-600">Confirmando seu e-mail...</p>

  if (estado === 'ok') {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold">E-mail confirmado</h1>
        <p className="text-sm text-slate-600">Sua conta está ativa e o período de teste começou.</p>
        <Link href="/login" className="mt-4 inline-block rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800">
          Entrar
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Não foi possível confirmar</h1>
      <p className="text-sm text-red-600">{mensagem}</p>
      <p className="mt-3 text-sm text-slate-500">
        Na{' '}
        <Link href="/login" className="text-indigo-700 hover:underline">
          tela de entrada
        </Link>
        , tente entrar: ela oferece reenviar o e-mail de confirmação.
      </p>
    </>
  )
}
