'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import ConfirmarCodigo from '@/components/ConfirmarCodigo'
import { PublicCard } from '@/components/PublicShell'
import { Button, Carregando, Field, Input } from '@/components/ui'

const TITULO = 'Confirmar acesso'
const DESCRICAO = 'Informe o e-mail do cadastro para digitar o código que você recebeu.'

export default function VerificarEmailPage() {
  return (
    <Suspense
      fallback={
        <PublicCard title={TITULO} description={DESCRICAO}>
          <Carregando linhas={2} />
        </PublicCard>
      }
    >
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const inicial = useSearchParams().get('email') ?? ''
  const [email, setEmail] = useState(inicial)
  const [pronto, setPronto] = useState(false)

  if (pronto) return <ConfirmarCodigo email={email.trim()} />

  return (
    <PublicCard title={TITULO} description={DESCRICAO}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPronto(true)
        }}
        className="flex flex-col gap-4"
      >
        <Field label="E-mail" required>
          <Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full">
          Continuar
        </Button>
      </form>
    </PublicCard>
  )
}
