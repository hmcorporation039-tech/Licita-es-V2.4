'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { AdminUser } from '@/lib/types'

function formatData(v: string | null) {
  if (!v) return 'sem prazo'
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isExpired(v: string | null) {
  return v != null && new Date(v).getTime() < Date.now()
}

export default function AdminUsuariosPage() {
  const user = useRequireSession()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdminField, setIsAdminField] = useState(false)
  const [diasValidade, setDiasValidade] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedInfo, setGeneratedInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    if (!user.isAdmin) {
      router.replace('/dashboard')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<AdminUser[]>('/api/admin/users')
      setUsers(data)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGeneratedInfo(null)
    setCreating(true)
    try {
      const result = await api.post<{ generatedPassword?: string; email: string }>('/api/admin/users', {
        email,
        name: name || undefined,
        password: password || undefined,
        isAdmin: isAdminField,
        diasValidade: diasValidade ? Number(diasValidade) : null,
      })
      if (result.generatedPassword) {
        setGeneratedInfo(`Senha gerada para ${result.email}: ${result.generatedPassword} (repasse com segurança — não fica salva em nenhum outro lugar)`)
      }
      setEmail('')
      setName('')
      setPassword('')
      setIsAdminField(false)
      setDiasValidade('')
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(u: AdminUser) {
    await api.patch(`/api/admin/users/${u.id}`, { active: !u.active })
    await load()
  }

  async function extend(u: AdminUser, dias: number | null) {
    await api.patch(`/api/admin/users/${u.id}`, { diasValidade: dias })
    await load()
  }

  if (!user || !user.isAdmin) return null

  const inputClass = 'rounded border border-slate-300 px-3 py-2 text-sm'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Usuários</h1>

      <form onSubmit={handleCreate} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Nome (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Senha (opcional — se vazio, gera uma)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          placeholder="Dias de acesso (vazio = sem prazo)"
          value={diasValidade}
          onChange={(e) => setDiasValidade(e.target.value)}
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input type="checkbox" checked={isAdminField} onChange={(e) => setIsAdminField(e.target.checked)} />
          Também é administrador
        </label>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {generatedInfo && <p className="text-sm text-emerald-700 sm:col-span-2">{generatedInfo}</p>}

        <button
          type="submit"
          disabled={creating}
          className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
        >
          {creating ? 'Criando...' : 'Criar usuário'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium">
                  {u.email} {u.isAdmin && <span className="text-xs text-indigo-700">(admin)</span>}
                  {!u.active && <span className="ml-1 text-xs text-red-600">(desativado)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {u.name ?? 'sem nome'} · acesso: {formatData(u.accessExpiresAt)}
                  {isExpired(u.accessExpiresAt) && <span className="ml-1 text-red-600">(expirado)</span>}
                  {!u.hasPassword && <span className="ml-1 text-amber-600">· sem senha definida</span>}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button onClick={() => extend(u, 30)} className="text-indigo-700 hover:underline">
                  +30 dias
                </button>
                <button onClick={() => extend(u, null)} className="text-slate-600 hover:underline">
                  remover prazo
                </button>
                <button onClick={() => toggleActive(u)} className="text-slate-600 hover:underline">
                  {u.active ? 'desativar' : 'ativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
