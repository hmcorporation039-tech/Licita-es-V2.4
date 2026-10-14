'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { PublicCard } from '@/components/PublicShell'
import { Button, Carregando, Field, FormError, Input, LinkButton, TextLink } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <PublicCard title="Nova senha">
          <Carregando linhas={2} />
        </PublicCard>
      }
    >
      <Formulario />
    </Suspense>
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
      <PublicCard title="Link incompleto">
        <p className="text-sm text-ink-2">
          Abra o link do e-mail ou <TextLink href="/esqueci-senha">peça um novo</TextLink>.
        </p>
      </PublicCard>
    )
  }

  if (pronto) {
    return (
      <PublicCard title="Senha alterada" description="Todas as sessões abertas foram encerradas. Entre com a nova senha.">
        <LinkButton href="/login" variant="primary" className="w-full">
          Entrar
        </LinkButton>
      </PublicCard>
    )
  }

  return (
    <PublicCard title="Nova senha" description="Escolha uma senha com pelo menos 10 caracteres.">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Field label="Nova senha" required>
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={72} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar nova senha" required>
          <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} maxLength={72} autoComplete="new-password" />
        </Field>
        {erro && (
          <FormError>
            {erro}{' '}
            {erro.startsWith('Link') && <TextLink href="/esqueci-senha">Pedir novo link</TextLink>}
          </FormError>
        )}
        <Button type="submit" variant="primary" loading={enviando} className="w-full">
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </PublicCard>
  )
}
