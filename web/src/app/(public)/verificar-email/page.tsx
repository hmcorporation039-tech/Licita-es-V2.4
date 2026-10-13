'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import ConfirmarCodigo from '@/components/ConfirmarCodigo'
import PublicShell from '@/components/PublicShell'

// Para quem fechou a tela do cadastro: informa o e-mail e digita o código recebido.
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
  const inicial = useSearchParams().get('email') ?? ''
  const [email, setEmail] = useState(inicial)
  const [pronto, setPronto] = useState(false)

  if (pronto) return <ConfirmarCodigo email={email.trim()} />

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setPronto(true)
      }}
      className="flex flex-col gap-3"
    >
      <h1 className="text-2xl font-semibold">Confirmar acesso</h1>
      <p className="text-sm text-slate-600">Informe o e-mail do cadastro para digitar o código que você recebeu.</p>
      <input
        type="email"
        required
        placeholder="voce@empresa.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800">
        Continuar
      </button>
    </form>
  )
}
