'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicCard } from '@/components/PublicShell'
import { Button, Field, FormError, Input, Notice, TextLink } from '@/components/ui'
import { api, ApiRequestError, CODIGO_ACESSO_EXPIRADO } from '@/lib/api'
import AcessoEncerrado, { lerDadosDoAcessoEncerrado, type DadosDoAcessoEncerrado } from '@/components/AcessoEncerrado'
import { setSession } from '@/lib/session'
import { User } from '@/lib/types'
import { guardarAvisoDeRecuperacao } from '@/lib/segundoFator'

type RespostaDoLogin = { token: string; user: User } | { segundoFator: true; desafio: string }

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
  const [desafio, setDesafio] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [comRecuperacao, setComRecuperacao] = useState(false)
  const router = useRouter()

  function entrarCom(token: string, user: User) {
    setSession(token, user)
    router.push('/dashboard')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setNaoConfirmado(false)
    setLoading(true)
    try {
      const r = await api.post<RespostaDoLogin>('/api/auth/login', { email, password })
      if ('segundoFator' in r) {
        setDesafio(r.desafio)
        setCodigo('')
        return
      }
      entrarCom(r.token, r.user)
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

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!desafio) return
    setError(null)
    setLoading(true)
    try {
      const r = await api.post<{ token: string; user: User; viaCodigoDeRecuperacao: boolean; codigosDeRecuperacaoRestantes: number }>('/api/auth/login/segundo-fator', { desafio, codigo })
      if (r.viaCodigoDeRecuperacao) guardarAvisoDeRecuperacao(r.codigosDeRecuperacaoRestantes)
      entrarCom(r.token, r.user)
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DESAFIO_EXPIRADO') {
        setDesafio(null)
        setPassword('')
      }
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao entrar')
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

  if (desafio) {
    return (
      <PublicCard title="Login em duas etapas" fala="Só mais um passo: o código do seu aplicativo.">
        <form onSubmit={enviarCodigo} className="flex flex-col gap-4">
          {comRecuperacao ? (
            <Field label="Código de recuperação" hint="Um dos 8 códigos que você guardou ao ativar. Cada um vale uma vez.">
              <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCDE-FGHJK" maxLength={20} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </Field>
          ) : (
            <Field label="Código do aplicativo" hint="Abra o Google Authenticator (ou o aplicativo que você usou) e digite os 6 números da Licita Bela.">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                placeholder="000 000"
                maxLength={7}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoFocus
              />
            </Field>
          )}
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" loading={loading} disabled={loading || codigo.trim().length < 6} className="pb-cta w-full">
            {loading ? 'Conferindo…' : 'Entrar'}
          </Button>
          <button
            type="button"
            className={BOTAO_COMO_LINK}
            onClick={() => {
              setComRecuperacao(!comRecuperacao)
              setCodigo('')
              setError(null)
            }}
          >
            {comRecuperacao ? 'Usar o código do aplicativo' : 'Perdi o celular: usar um código de recuperação'}
          </button>
          <button
            type="button"
            className={BOTAO_COMO_LINK}
            onClick={() => {
              setDesafio(null)
              setPassword('')
              setError(null)
            }}
          >
            Voltar
          </button>
        </form>
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
