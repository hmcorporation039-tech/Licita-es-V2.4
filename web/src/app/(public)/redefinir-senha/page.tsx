'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { PublicCard } from '@/components/PublicShell'
import { Button, Carregando, Field, FormError, Input, LinkButton, TextLink } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'

const FALA = 'Escolha uma senha nova e voltamos às suas licitações.'

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <PublicCard title="Nova senha" fala={FALA}>
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
      <PublicCard title="Link incompleto" fala="Esse link chegou pela metade. Peça um novo e eu te mando outro.">
        <p className="text-sm text-ink-2">
          Abra o link do e-mail ou <TextLink href="/esqueci-senha">peça um novo</TextLink>.
        </p>
      </PublicCard>
    )
  }

  if (pronto) {
    return (
      <PublicCard title="Senha alterada" description="Todas as sessões abertas foram encerradas. Entre com a nova senha." fala="Pronto, senha nova salva. Vamos voltar ao trabalho?">
        <LinkButton href="/login" variant="primary" className="pb-cta w-full">
          Entrar
        </LinkButton>
      </PublicCard>
    )
  }

  return (
    <PublicCard title="Nova senha" description="Escolha uma senha com pelo menos 10 caracteres." fala={FALA}>
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
        <Button type="submit" variant="primary" loading={enviando} className="pb-cta w-full">
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </PublicCard>
  )
}
