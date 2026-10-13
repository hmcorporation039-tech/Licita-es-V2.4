'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import PublicShell from '@/components/PublicShell'
import { api, ApiRequestError } from '@/lib/api'

export default function RedefinirSenhaPage() {
  return (
    <PublicShell estreito>
      <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
        <Formulario />
      </Suspense>
    </PublicShell>
  )
}

function Formulario() {
  const token = useSearchParams().get('token')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha !== confirmar) {
      setErro('A confirmação não bate com a senha')
      return
    }
    if (senha.length < 10) {
      setErro('A senha precisa ter pelo menos 10 caracteres')
      return
    }
    setEnviando(true)
    try {
      await api.post('/api/auth/reset-password', { token, novaSenha: senha })
      setPronto(true)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Erro ao redefinir a senha')
    } finally {
      setEnviando(false)
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold">Link incompleto</h1>
        <p className="text-sm text-slate-600">
          Abra o link do e-mail ou{' '}
          <Link href="/esqueci-senha" className="text-indigo-700 hover:underline">
            peça um novo
          </Link>
          .
        </p>
      </>
    )
  }

  if (pronto) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold">Senha alterada</h1>
        <p className="text-sm text-slate-600">Todas as sessões abertas foram encerradas. Entre com a nova senha.</p>
        <Link href="/login" className="mt-4 inline-block rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800">
          Entrar
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Nova senha</h1>
      <p className="mb-5 text-sm text-slate-500">Escolha uma senha com pelo menos 10 caracteres.</p>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <input required type="password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm" maxLength={72} autoComplete="new-password" />
        <input required type="password" placeholder="Confirmar nova senha" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm" maxLength={72} autoComplete="new-password" />
        {erro && (
          <p className="text-sm text-red-600">
            {erro}{' '}
            {erro.startsWith('Link') && (
              <Link href="/esqueci-senha" className="underline">
                Pedir novo link
              </Link>
            )}
          </p>
        )}
        <button type="submit" disabled={enviando} className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50">
          {enviando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </>
  )
}
