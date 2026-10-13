'use client'

import { useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { replaceSessionToken } from '@/lib/session'
import UsoDoPlano from '@/components/UsoDoPlano'

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

  const inputClass = 'rounded border border-slate-300 px-3 py-2 text-sm'

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">Minha conta</h1>
      <p className="mb-6 text-sm text-slate-500">{user.email}</p>

      <div className="mb-4">
        <UsoDoPlano />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-800">Trocar senha</h2>
        <input
          type="password"
          required
          placeholder="Senha atual"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          placeholder="Nova senha (mínimo 10 caracteres)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          placeholder="Confirmar nova senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-700">Senha alterada com sucesso.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>

      <SeusDados />
    </div>
  )
}

// Direitos do titular (LGPD): baixar uma cópia dos dados e pedir a exclusão da conta.
function SeusDados() {
  const [baixando, setBaixando] = useState(false)
  const [senha, setSenha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [abrirExclusao, setAbrirExclusao] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

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
    <section className="mt-4 flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-800">Seus dados</h2>
      <p className="text-xs text-slate-500">Baixe uma cópia dos dados da sua conta e da empresa, ou peça a exclusão definitiva.</p>
      <button
        onClick={baixar}
        disabled={baixando}
        className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {baixando ? 'Gerando...' : 'Baixar meus dados'}
      </button>
      {!abrirExclusao ? (
        <button onClick={() => setAbrirExclusao(true)} className="text-left text-xs text-red-700 hover:underline">
          Excluir minha conta e os dados da empresa...
        </button>
      ) : (
        <form onSubmit={pedirExclusao} className="flex flex-col gap-2 rounded border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            A exclusão apaga a empresa, todos os usuários e os dados cadastrados, e não pode ser desfeita. Só o dono da empresa pode pedir.
          </p>
          <input
            type="password"
            required
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800">
              Pedir exclusão
            </button>
            <button type="button" onClick={() => setAbrirExclusao(false)} className="text-sm text-slate-600">
              Cancelar
            </button>
          </div>
        </form>
      )}
      {mensagem && <p className="text-sm text-emerald-700">{mensagem}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </section>
  )
}
