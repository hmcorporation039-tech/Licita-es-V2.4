'use client'

import { useEffect, useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Company, CompanyDocument, CompanyMember, CompanyType } from '@/lib/types'
import { DOCUMENT_TYPE_OPTIONS, documentTypeLabel } from '@/lib/documentTypes'

const inputClass = 'rounded border border-slate-300 px-3 py-2 text-sm'

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

export default function EmpresaPage() {
  const user = useRequireSession()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<CompanyType>('PESSOA_FISICA')
  // CPF/CNPJ já gravado: só o suporte altera (ver PATCH /api/company).
  const [documentoTravado, setDocumentoTravado] = useState(false)
  const [documento, setDocumento] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cep, setCep] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [creatingMember, setCreatingMember] = useState(false)

  const [docs, setDocs] = useState<CompanyDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [docTipo, setDocTipo] = useState('')
  const [docNome, setDocNome] = useState('')
  const [docDataEmissao, setDocDataEmissao] = useState('')
  const [docDataValidade, setDocDataValidade] = useState('')
  const [docObservacao, setDocObservacao] = useState('')
  const [creatingDoc, setCreatingDoc] = useState(false)

  useEffect(() => {
    if (!user) return
    load()
    loadDocs()
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
      setDocumentoTravado(!!(data.cnpj || data.cpf))
      setCompanyEmail(data.email ?? '')
      setTelefone(data.telefone ?? '')
      setResponsavel(data.responsavel ?? '')
      setEndereco(data.endereco ?? '')
      setCep(data.cep ?? '')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar empresa')
    } finally {
      setLoading(false)
    }
  }

  async function loadDocs() {
    setDocsLoading(true)
    try {
      const data = await api.get<CompanyDocument[]>('/api/company-documents')
      setDocs(data)
    } catch (err) {
      setDocsError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar documentos')
    } finally {
      setDocsLoading(false)
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
        email: companyEmail || null,
        telefone: telefone || null,
        responsavel: responsavel || null,
        endereco: endereco || null,
        cep: cep || null,
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

  function onSelectDocTipo(value: string) {
    setDocTipo(value)
    if (value && !docNome) {
      const opt = DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)
      if (opt) setDocNome(opt.label)
    }
  }

  async function criarDocumento(e: React.FormEvent) {
    e.preventDefault()
    setDocsError(null)
    setCreatingDoc(true)
    try {
      await api.post('/api/company-documents', {
        tipo: docTipo || null,
        nome: docNome,
        dataEmissao: docDataEmissao || null,
        dataValidade: docDataValidade || null,
        observacao: docObservacao.trim() || null,
      })
      setDocTipo('')
      setDocNome('')
      setDocDataEmissao('')
      setDocDataValidade('')
      setDocObservacao('')
      await loadDocs()
    } catch (err) {
      setDocsError(err instanceof ApiRequestError ? err.message : 'Erro ao cadastrar documento')
    } finally {
      setCreatingDoc(false)
    }
  }

  async function removerDocumento(docId: string) {
    if (!confirm('Remover este documento?')) return
    await api.delete(`/api/company-documents/${docId}`)
    await loadDocs()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Empresa</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Dados da empresa</h2>
        <form onSubmit={salvarEmpresa} className="grid gap-3 sm:grid-cols-2">
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
            disabled={!souOwner || documentoTravado}
            title={documentoTravado ? 'Para alterar o tipo de conta, fale com o suporte.' : undefined}
            className={inputClass}
          >
            <option value="PESSOA_FISICA">Pessoa física</option>
            <option value="PESSOA_JURIDICA">Pessoa jurídica</option>
          </select>
          <input
            placeholder={tipo === 'PESSOA_JURIDICA' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            disabled={!souOwner || documentoTravado}
            title={documentoTravado ? 'Para alterar o CPF/CNPJ, fale com o suporte.' : undefined}
            className={inputClass}
          />
          <input
            type="email"
            placeholder="E-mail da empresa (opcional)"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            disabled={!souOwner}
            className={inputClass}
          />
          <input
            placeholder="Telefone (opcional)"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            disabled={!souOwner}
            className={inputClass}
          />
          <input
            placeholder="Responsável (opcional)"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            disabled={!souOwner}
            className={inputClass}
          />
          <input
            placeholder="CEP (opcional)"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            disabled={!souOwner}
            className={inputClass}
          />
          <input
            placeholder="Endereço (opcional)"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            disabled={!souOwner}
            className={`${inputClass} sm:col-span-2`}
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
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-medium text-slate-700">Documentos de habilitação e constituição</h2>
        <p className="mb-4 text-xs text-slate-500">
          Cadastre uma vez os documentos que a empresa já possui — eles são cruzados automaticamente com o
          checklist de cada licitação, e avisamos quando algum estiver perto de vencer.
        </p>

        <form onSubmit={criarDocumento} className="mb-4 grid gap-3 sm:grid-cols-2">
          <select
            value={docTipo}
            onChange={(e) => onSelectDocTipo(e.target.value)}
            className={`${inputClass} sm:col-span-2`}
          >
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
            value={docNome}
            onChange={(e) => setDocNome(e.target.value)}
            className={`${inputClass} sm:col-span-2`}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data de emissão</label>
            <input
              type="date"
              value={docDataEmissao}
              onChange={(e) => setDocDataEmissao(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data de validade (vazio = não vence)</label>
            <input
              type="date"
              value={docDataValidade}
              onChange={(e) => setDocDataValidade(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <input
            placeholder="Observação (opcional)"
            value={docObservacao}
            onChange={(e) => setDocObservacao(e.target.value)}
            className={`${inputClass} sm:col-span-2`}
          />

          {docsError && <p className="text-sm text-red-600 sm:col-span-2">{docsError}</p>}
          <button
            type="submit"
            disabled={creatingDoc}
            className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
          >
            {creatingDoc ? 'Salvando...' : 'Cadastrar documento'}
          </button>
        </form>

        {docsLoading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum documento cadastrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((doc) => {
              const status = validadeStatus(doc.dataValidade)
              return (
                <li key={doc.id} className="flex items-start justify-between gap-4 rounded border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-medium">{doc.nome}</p>
                    <p className="text-xs text-slate-500">
                      {documentTypeLabel(doc.tipo) ?? 'Avulso'} · Emissão: {formatData(doc.dataEmissao)} · Validade:{' '}
                      {formatData(doc.dataValidade)}
                    </p>
                    {doc.observacao && <p className="mt-1 text-xs text-slate-400">{doc.observacao}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                    <button onClick={() => removerDocumento(doc.id)} className="text-xs text-red-600 hover:underline">
                      Remover
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Usuários da empresa</h2>
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

        {souOwner && (
          <form onSubmit={convidarMembro} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <h3 className="text-sm font-medium text-slate-700 sm:col-span-2">Cadastrar usuário</h3>
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
              {creatingMember ? 'Criando...' : 'Cadastrar'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
