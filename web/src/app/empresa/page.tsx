'use client'

import { useEffect, useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Company, CompanyMember, CompanyType } from '@/lib/types'

const inputClass = 'rounded border border-slate-300 px-3 py-2 text-sm'

export default function EmpresaPage() {
  const user = useRequireSession()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<CompanyType>('PESSOA_FISICA')
  const [documento, setDocumento] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [creatingMember, setCreatingMember] = useState(false)

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Company>('/api/company')
      setCompany(data)
      setName(data.name)
      setTipo(data.tipo)
      setDocumento(data.tipo === 'PESSOA_JURIDICA' ? (data.cnpj ?? '') : (data.cpf ?? ''))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar empresa')
    } finally {
      setLoading(false)
    }
  }

  if (!user || !company) return loading ? <p className="text-sm text-slate-500">Carregando...</p> : null

  const souOwner = company.users.find((m) => m.id === user.id)?.companyRole === 'OWNER'

  async function salvarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavingCompany(true)
    try {
      const updated = await api.patch<Company>('/api/company', {
        name,
        tipo,
        cnpj: tipo === 'PESSOA_JURIDICA' ? documento || null : null,
        cpf: tipo === 'PESSOA_FISICA' ? documento || null : null,
      })
      setCompany((prev) => (prev ? { ...prev, ...updated } : prev))
      setInfo('Dados da empresa atualizados.')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao salvar empresa')
    } finally {
      setSavingCompany(false)
    }
  }

  async function convidarMembro(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setCreatingMember(true)
    try {
      const result = await api.post<{ email: string; generatedPassword?: string }>('/api/company/members', {
        email: memberEmail,
        name: memberName || undefined,
        password: memberPassword || undefined,
      })
      setInfo(
        result.generatedPassword
          ? `Conta criada para ${result.email}. Senha gerada: ${result.generatedPassword} (repasse com segurança — não fica salva em nenhum outro lugar)`
          : `Conta criada para ${result.email}.`
      )
      setMemberEmail('')
      setMemberName('')
      setMemberPassword('')
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao convidar membro')
    } finally {
      setCreatingMember(false)
    }
  }

  async function alternarPapel(membro: CompanyMember) {
    setError(null)
    try {
      await api.patch(`/api/company/members/${membro.id}`, {
        companyRole: membro.companyRole === 'OWNER' ? 'MEMBER' : 'OWNER',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao alterar papel')
    }
  }

  async function alternarAtivo(membro: CompanyMember) {
    setError(null)
    try {
      await api.patch(`/api/company/members/${membro.id}`, { active: !membro.active })
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao alterar acesso')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Empresa</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}

      <form onSubmit={salvarEmpresa} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <input
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!souOwner}
          className={inputClass}
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as CompanyType)}
          disabled={!souOwner}
          className={inputClass}
        >
          <option value="PESSOA_FISICA">Pessoa física</option>
          <option value="PESSOA_JURIDICA">Pessoa jurídica</option>
        </select>
        <input
          placeholder={tipo === 'PESSOA_JURIDICA' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          disabled={!souOwner}
          className={inputClass}
        />
        {souOwner && (
          <button
            type="submit"
            disabled={savingCompany}
            className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
          >
            {savingCompany ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </form>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Membros</h2>
        <ul className="flex flex-col gap-2">
          {company.users.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium">
                  {m.email} {m.companyRole === 'OWNER' && <span className="text-xs text-indigo-700">(dono)</span>}
                  {!m.active && <span className="ml-1 text-xs text-red-600">(desativado)</span>}
                </p>
                <p className="text-xs text-slate-500">{m.name ?? 'sem nome'}</p>
              </div>
              {souOwner && (
                <div className="flex gap-3 text-sm">
                  <button onClick={() => alternarPapel(m)} className="text-indigo-700 hover:underline">
                    {m.companyRole === 'OWNER' ? 'tornar membro' : 'tornar dono'}
                  </button>
                  <button onClick={() => alternarAtivo(m)} className="text-slate-600 hover:underline">
                    {m.active ? 'desativar' : 'ativar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {souOwner && (
        <form onSubmit={convidarMembro} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="text-sm font-medium text-slate-700 sm:col-span-2">Convidar colega</h2>
          <input
            type="email"
            required
            placeholder="E-mail"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Nome (opcional)"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Senha (opcional — se vazio, gera uma)"
            value={memberPassword}
            onChange={(e) => setMemberPassword(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={creatingMember}
            className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
          >
            {creatingMember ? 'Criando...' : 'Convidar'}
          </button>
        </form>
      )}
    </div>
  )
}
