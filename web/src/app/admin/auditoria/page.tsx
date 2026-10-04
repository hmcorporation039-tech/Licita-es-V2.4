'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { getSessionToken } from '@/lib/session'
import { ROTULO_ACAO } from '@/lib/adminTypes'
import type { EventoAuditoria } from '@/lib/adminTypes'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

export default function AdminAuditoriaPage() {
  return (
    <AdminShell titulo="Trilha de auditoria">
      {() => (
        <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
          <Conteudo />
        </Suspense>
      )}
    </AdminShell>
  )
}

function Conteudo() {
  const inicial = useSearchParams()
  const [acao, setAcao] = useState('')
  const [ator, setAtor] = useState('')
  const [empresa, setEmpresa] = useState(inicial.get('companyId') ?? '')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [eventos, setEventos] = useState<EventoAuditoria[]>([])
  const [proximo, setProximo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const filtroQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (acao) p.set('action', acao)
    if (ator.trim()) p.set('actor', ator.trim())
    if (empresa.trim()) p.set('companyId', empresa.trim())
    if (de) p.set('from', new Date(de + 'T00:00:00').toISOString())
    if (ate) p.set('to', new Date(ate + 'T23:59:59').toISOString())
    return p
  }, [acao, ator, empresa, de, ate])

  const carregar = useCallback(
    async (depoisDe?: string) => {
      setCarregando(true)
      try {
        const p = filtroQuery()
        p.set('limit', '50')
        if (depoisDe) p.set('before', depoisDe)
        const r = await api.get<{ eventos: EventoAuditoria[]; proximo: string | null }>(`/api/admin/audit?${p}`)
        setEventos((atual) => (depoisDe ? [...atual, ...r.eventos] : r.eventos))
        setProximo(r.proximo)
        setErro(null)
      } catch (e) {
        setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
      } finally {
        setCarregando(false)
      }
    },
    [filtroQuery]
  )

  useEffect(() => {
    const t = setTimeout(() => carregar(), 300)
    return () => clearTimeout(t)
  }, [carregar])

  async function exportar() {
    try {
      // O token vai no cabeçalho (não na URL): por isso baixamos como arquivo em vez de abrir um link.
      const res = await fetch(`${API_URL}/api/admin/audit/export?${filtroQuery()}`, {
        headers: { Authorization: `Bearer ${getSessionToken() ?? ''}` },
      })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao exportar')
    }
  }

  const campo = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-slate-600">
          Ação
          <select value={acao} onChange={(e) => setAcao(e.target.value)} className={campo}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Quem (e-mail)
          <input value={ator} onChange={(e) => setAtor(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          ID da empresa
          <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={`${campo} w-72`} />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
        </label>
        <button onClick={exportar} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Exportar CSV
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Quem</th>
              <th className="px-3 py-2">O quê</th>
              <th className="px-3 py-2">Detalhes</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((ev) => (
              <tr key={ev.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{new Date(ev.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2">{ev.actorEmail ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">
                  <span className={ev.action === 'LOGIN_FALHA' || ev.action === 'COTA_EXCEDIDA' ? 'text-red-700' : ''}>
                    {ROTULO_ACAO[ev.action] ?? ev.action}
                  </span>
                  {ev.entityType && <div className="text-xs text-slate-400">{ev.entityType}</div>}
                </td>
                <td className="px-3 py-2">
                  {ev.metadata ? (
                    <button onClick={() => setAberto(aberto === ev.id ? null : ev.id)} className="text-xs text-indigo-700 hover:underline">
                      {aberto === ev.id ? 'ocultar' : 'ver'}
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                  {aberto === ev.id && (
                    <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{ev.ip ?? '—'}</td>
              </tr>
            ))}
            {!carregando && eventos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Nenhum evento com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {proximo && (
        <button
          onClick={() => carregar(proximo)}
          disabled={carregando}
          className="self-start rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {carregando ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}
