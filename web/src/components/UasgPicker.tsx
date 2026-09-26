'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { UasgResult } from '@/lib/types'

// Busca + seleção de UASGs (unidades compradoras) pra filtrar item monitorado.
// O código UASG só existe no sistema legado (ComprasNet) — licitações do PNCP
// não têm esse código, então esse filtro não as restringe (ver matcherService.ts).
// Por isso, ao escolher uma UASG, também sugerimos o nome do órgão pro campo
// de Órgãos (que funciona nas duas fontes) via onPickOrgao.
export default function UasgPicker({
  selected,
  onChange,
  onPickOrgao,
}: {
  selected: UasgResult[]
  onChange: (next: UasgResult[]) => void
  onPickOrgao?: (nomeOrgao: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UasgResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const timeout = setTimeout(() => {
      api
        .get<UasgResult[]>(`/api/uasg/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  function adicionar(u: UasgResult) {
    if (!selected.some((s) => s.codigoUasg === u.codigoUasg)) {
      onChange([...selected, u])
      if (u.nomeOrgao) onPickOrgao?.(u.nomeOrgao)
    }
    setQuery('')
    setResults([])
  }

  function remover(codigoUasg: string) {
    onChange(selected.filter((s) => s.codigoUasg !== codigoUasg))
  }

  return (
    <div>
      <div className="relative">
        <input
          placeholder="Buscar UASG por nome, órgão ou código (opcional — só afeta licitações do ComprasNet)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
            {searching ? (
              <p className="px-3 py-2 text-sm text-slate-500">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Nenhuma UASG encontrada.</p>
            ) : (
              results.map((u) => (
                <button
                  key={u.codigoUasg}
                  type="button"
                  onClick={() => adicionar(u)}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{u.nomeUasg}</span>{' '}
                  <span className="text-xs text-slate-400">({u.codigoUasg})</span>
                  <p className="text-xs text-slate-500">
                    {u.nomeOrgao ?? 'Órgão n/d'} — {u.municipioNome ?? 'n/d'}/{u.siglaUf ?? 'n/d'}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.codigoUasg}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800"
            >
              {u.nomeUasg} ({u.codigoUasg})
              <button type="button" onClick={() => remover(u.codigoUasg)} className="text-indigo-400 hover:text-indigo-700">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
