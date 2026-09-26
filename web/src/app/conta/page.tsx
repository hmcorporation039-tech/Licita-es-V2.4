'use client'

import { useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { replaceSessionToken } from '@/lib/session'

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
    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres')
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
          placeholder="Nova senha (mínimo 8 caracteres)"
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
    </div>
  )
}
