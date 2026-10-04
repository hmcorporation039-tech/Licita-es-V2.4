'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
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
  const [estado, setEstado] = useState<'confirmando' | 'ok' | 'erro'>('confirmando')
  const [mensagem, setMensagem] = useState('')
  // O link é de uso único: sem esta trava, o modo estrito do React (dev)
  // dispararia a confirmação duas vezes e a segunda mostraria erro.
  const jaEnviou = useRef(false)

  useEffect(() => {
    if (jaEnviou.current) return
    jaEnviou.current = true
    if (!token) {
      setEstado('erro')
      setMensagem('Link incompleto. Abra o link do e-mail de confirmação.')
      return
    }
    // POST (e não GET): programas de segurança de e-mail que "abrem" os links
    // não consomem a confirmação por acidente.
    api
      .post('/api/auth/verify-email', { token })
      .then(() => setEstado('ok'))
      .catch((e) => {
        setEstado('erro')
        setMensagem(e instanceof ApiRequestError ? e.message : 'Não foi possível confirmar o e-mail.')
      })
  }, [token])

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
