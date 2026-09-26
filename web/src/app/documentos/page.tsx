'use client'

import { useEffect, useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { CompanyDocument } from '@/lib/types'
import { DOCUMENT_TYPE_OPTIONS, documentTypeLabel } from '@/lib/documentTypes'

type ValidadeStatus = 'sem-validade' | 'valido' | 'vence-em-breve' | 'vencido'

function validadeStatus(dataValidade: string | null): ValidadeStatus {
  if (!dataValidade) return 'sem-validade'
  const dias = (new Date(dataValidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (dias < 0) return 'vencido'
  if (dias <= 15) return 'vence-em-breve'
  return 'valido'
}

const STATUS_LABEL: Record<ValidadeStatus, string> = {
  'sem-validade': 'Não vence',
  valido: 'Válido',
  'vence-em-breve': 'Vence em breve',
  vencido: 'Vencido',
}

const STATUS_CLASS: Record<ValidadeStatus, string> = {
  'sem-validade': 'bg-slate-100 text-slate-600',
  valido: 'bg-emerald-100 text-emerald-800',
  'vence-em-breve': 'bg-amber-100 text-amber-800',
  vencido: 'bg-red-100 text-red-800',
}

function formatData(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('pt-BR')
}

export default function DocumentosPage() {
  const user = useRequireSession()
  const [docs, setDocs] = useState<CompanyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState('')
  const [nome, setNome] = useState('')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataValidade, setDataValidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<CompanyDocument[]>('/api/company-documents')
      setDocs(data)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  function onSelectTipo(value: string) {
    setTipo(value)
    if (value && !nome) {
      const opt = DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)
      if (opt) setNome(opt.label)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setCreating(true)
    try {
      await api.post('/api/company-documents', {
        tipo: tipo || null,
        nome,
        dataEmissao: dataEmissao || null,
        dataValidade: dataValidade || null,
        observacao: observacao.trim() || null,
      })
      setTipo('')
      setNome('')
      setDataEmissao('')
      setDataValidade('')
      setObservacao('')
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao cadastrar documento')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(docId: string) {
    if (!user) return
    if (!confirm('Remover este documento?')) return
    await api.delete(`/api/company-documents/${docId}`)
    await load()
  }

  if (!user) return null

  const inputClass = 'rounded border border-slate-300 px-3 py-2 text-sm'

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Documentos da empresa</h1>
      <p className="mb-4 text-sm text-slate-500">
        Cadastre uma vez os documentos que a empresa já possui — eles são cruzados automaticamente com o
        checklist de cada licitação, e avisamos quando algum estiver perto de vencer.
      </p>

      <form onSubmit={handleCreate} className="mb-6 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <select value={tipo} onChange={(e) => onSelectTipo(e.target.value)} className={`${inputClass} sm:col-span-2`}>
          <option value="">Documento avulso (fora da lista padrão)</option>
          {DOCUMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.section} — {opt.label}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Nome do documento"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={`${inputClass} sm:col-span-2`}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Data de emissão</label>
          <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Data de validade (vazio = não vence)</label>
          <input type="date" value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <input
          placeholder="Observação (opcional)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className={`${inputClass} sm:col-span-2`}
        />

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
        >
          {creating ? 'Salvando...' : 'Cadastrar documento'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum documento cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((doc) => {
            const status = validadeStatus(doc.dataValidade)
            return (
              <li key={doc.id} className="flex items-start justify-between gap-4 rounded border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium">{doc.nome}</p>
                  <p className="text-xs text-slate-500">
                    {documentTypeLabel(doc.tipo) ?? 'Avulso'} · Emissão: {formatData(doc.dataEmissao)} · Validade: {formatData(doc.dataValidade)}
                  </p>
                  {doc.observacao && <p className="mt-1 text-xs text-slate-400">{doc.observacao}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  <button onClick={() => handleDelete(doc.id)} className="text-xs text-red-600 hover:underline">
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
