'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, KeyRound, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { replaceSessionToken } from '@/lib/session'
import UsoDoPlano from '@/components/UsoDoPlano'
import { Button, Field, FormError, Input, Notice, PageHeader, Panel, Textarea, useDialogo } from '@/components/ui'

export default function ContaPage() {
  const user = useRequireSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha')
      return
    }
    if (newPassword.length < 10) {
      setError('A nova senha precisa ter pelo menos 10 caracteres')
      return
    }

    setSaving(true)
    try {
      const { token } = await api.post<{ token: string }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      })
      replaceSessionToken(token)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao trocar a senha')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <>
      <PageHeader title="Minha conta" description={user.email} />

      <div className="flex w-full max-w-xl flex-col gap-6">
        <UsoDoPlano />

        <Panel title="Trocar senha">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Senha atual" required>
              <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 10 caracteres." required>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirmar nova senha" required>
              <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>

            <FormError>{error}</FormError>
            {success && <Notice tone="ok">Senha alterada com sucesso.</Notice>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" icon={KeyRound} loading={saving}>
                {saving ? 'Salvando…' : 'Salvar nova senha'}
              </Button>
            </div>
          </form>
        </Panel>

        <SeusDados />
      </div>
    </>
  )
}

function SeusDados() {
  const { confirmar, dialogo } = useDialogo()
  const [baixando, setBaixando] = useState(false)
  const [senha, setSenha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [abrirExclusao, setAbrirExclusao] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const painelDeExclusao = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!abrirExclusao) return
    const painel = painelDeExclusao.current
    if (!painel) return
    painel.scrollIntoView({ behavior: 'smooth', block: 'center' })
    painel.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
  }, [abrirExclusao])

  async function baixar() {
    setBaixando(true)
    setErro(null)
    try {
      const dados = await api.get<unknown>('/api/conta/meus-dados')
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível gerar o arquivo')
    } finally {
      setBaixando(false)
    }
  }

  async function pedirExclusao(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const confirmado = await confirmar({
      titulo: 'Pedir a exclusão definitiva?',
      mensagem: 'A exclusão apaga a empresa, todos os usuários e os dados cadastrados, e não pode ser desfeita.',
      confirmarRotulo: 'Pedir exclusão',
      perigo: true,
    })
    if (!confirmado) return
    try {
      const r = await api.post<{ mensagem: string }>('/api/conta/solicitar-exclusao', { senha, motivo: motivo.trim() || undefined })
      setMensagem(r.mensagem)
      setAbrirExclusao(false)
      setSenha('')
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível registrar o pedido')
    }
  }

  return (
    <Panel title="Seus dados" description="Baixe uma cópia dos dados da sua conta e da empresa, ou peça a exclusão definitiva.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} loading={baixando} onClick={baixar}>
            {baixando ? 'Gerando…' : 'Baixar meus dados'}
          </Button>
          {!abrirExclusao && (
            <Button variant="danger" icon={Trash2} onClick={() => setAbrirExclusao(true)}>
              Excluir conta e dados da empresa…
            </Button>
          )}
        </div>

        {abrirExclusao && (
          <form ref={painelDeExclusao} onSubmit={pedirExclusao} className="flex flex-col gap-4 rounded border border-danger-line p-4">
            <p className="text-sm text-ink-2">
              A exclusão apaga a empresa, todos os usuários e os dados cadastrados, e não pode ser desfeita. Só o dono da empresa pode pedir.
            </p>
            <Field label="Sua senha" required>
              <Input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            <Field label="Motivo" hint="Opcional.">
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" icon={Trash2}>
                Pedir exclusão
              </Button>
              <Button variant="ghost" onClick={() => setAbrirExclusao(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {mensagem && <Notice tone="ok">{mensagem}</Notice>}
        <FormError>{erro}</FormError>
      </div>
      {dialogo}
    </Panel>
  )
}
