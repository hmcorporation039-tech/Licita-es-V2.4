'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PublicCard } from '@/components/PublicShell'
import { Button, Field, FormError, Input, Notice, TextLink } from '@/components/ui'
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
    <PublicCard title="Esqueci minha senha" description="Informe o e-mail da conta e enviaremos um link para escolher uma nova senha.">
      <div className="flex flex-col gap-4">
        {mensagem ? (
          <Notice tone="ok">{mensagem}</Notice>
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <Field label="E-mail" required>
              <Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <FormError>{erro}</FormError>
            <Button type="submit" variant="primary" loading={enviando} className="w-full">
              {enviando ? 'Enviando…' : 'Enviar link'}
            </Button>
          </form>
        )}
        <TextLink href="/login" className="inline-flex items-center gap-1.5 self-start text-sm">
          <ArrowLeft size={14} aria-hidden />
          Voltar para entrar
        </TextLink>
      </div>
    </PublicCard>
  )
}
