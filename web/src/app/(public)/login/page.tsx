'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicCard } from '@/components/PublicShell'
import { Button, Field, FormError, Input, Notice, TextLink } from '@/components/ui'
import { api, ApiRequestError, CODIGO_ACESSO_EXPIRADO } from '@/lib/api'
import AcessoEncerrado, { lerDadosDoAcessoEncerrado, type DadosDoAcessoEncerrado } from '@/components/AcessoEncerrado'
import { setSession } from '@/lib/session'
import { User } from '@/lib/types'

const BOTAO_COMO_LINK =
  'self-start text-sm font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [naoConfirmado, setNaoConfirmado] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [encerrado, setEncerrado] = useState<DadosDoAcessoEncerrado | null>(null)
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
      if (err instanceof ApiRequestError && err.code === CODIGO_ACESSO_EXPIRADO) {
        setEncerrado(lerDadosDoAcessoEncerrado(err.detalhes))
        return
      }
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

  if (encerrado) {
    return (
      <PublicCard
        title={encerrado.emTeste ? 'Seu teste grátis terminou' : 'O acesso da sua conta terminou'}
        fala="Seus dados continuam guardados. Veja como continuar."
      >
        <AcessoEncerrado
          dados={encerrado}
          emailInicial={email}
          senhaInicial={password}
          onVoltar={() => {
            setEncerrado(null)
            setPassword('')
          }}
        />
      </PublicCard>
    )
  }

  return (
    <PublicCard
      title="Entrar"
      fala="Bom te ver de novo. Já separei as licitações de hoje."
      description={
        <>
          Não tem conta? <TextLink href="/cadastro">Crie uma e teste grátis</TextLink>.
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="E-mail" required>
          <Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormError>{error}</FormError>
        {naoConfirmado && (
          <div className="flex flex-col gap-2">
            <TextLink href={`/verificar-email?email=${encodeURIComponent(email)}`} className="self-start text-sm">
              Digitar o código de confirmação
            </TextLink>
            <button type="button" onClick={reenviar} className={BOTAO_COMO_LINK}>
              Reenviar código
            </button>
          </div>
        )}
        {info && <Notice tone="ok">{info}</Notice>}
        <Button type="submit" variant="primary" loading={loading} className="pb-cta w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
        <TextLink href="/esqueci-senha" className="self-start text-sm">
          Esqueci minha senha
        </TextLink>
      </form>
    </PublicCard>
  )
}
