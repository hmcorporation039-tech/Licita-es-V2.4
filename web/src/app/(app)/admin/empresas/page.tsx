'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { EmpresaResumo } from '@/lib/adminTypes'

interface Lista {
  total: number
  page: number
  limit: number
  empresas: EmpresaResumo[]
}

export default function AdminEmpresasPage() {
  return <AdminShell titulo="Empresas">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [dados, setDados] = useState<Lista | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q.trim()) params.set('q', q.trim())
      setDados(await api.get<Lista>(`/api/admin/companies?${params}`))
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [q, page])

  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
  }, [carregar])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limit)) : 1

  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder="Buscar por nome, CNPJ ou e-mail"
        className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Plano</th>
              <th className="px-3 py-2 text-right">Usuários</th>
              <th className="px-3 py-2 text-right">Itens</th>
              <th className="px-3 py-2 text-right">Docs</th>
              <th className="px-3 py-2 text-right">IA/mês</th>
              <th className="px-3 py-2">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {dados?.empresas.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/empresas/${e.id}`} className="font-medium text-indigo-700 hover:underline">
                    {e.nome}
                  </Link>
                  <div className="text-xs text-slate-500">{e.cnpj ?? e.cpf ?? (e.tipo === 'PESSOA_FISICA' ? 'pessoa física' : '—')}</div>
                </td>
                <td className="px-3 py-2">
                  {e.planCode}
                  {e.quotaOverrides && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">ajustado</span>}
                </td>
                <td className="px-3 py-2 text-right">{e.usuarios}</td>
                <td className="px-3 py-2 text-right">{e.itensMonitorados}</td>
                <td className="px-3 py-2 text-right">{e.documentos}</td>
                <td className="px-3 py-2 text-right">{e.analisesIaNoMes}</td>
                <td className="px-3 py-2 text-slate-500">{new Date(e.criadaEm).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
            {dados && dados.empresas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nenhuma empresa encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{dados ? `${dados.total} empresa(s)` : ''}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">
            Anterior
          </button>
          <span>
            {page} / {paginas}
          </span>
          <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">
            Próxima
          </button>
        </div>
      </div>
    </div>
  )
}
