'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { CatalogResult } from '@/lib/types'

// Autocomplete de código de catálogo (CATMAT = material, CATSER = serviço).
// Busca por descrição em /api/catalog/search e, ao escolher, adiciona o código
// à string separada por vírgula que a tela de itens já usa (onAdd).
export default function CatalogPicker({
  tipo,
  onAdd,
}: {
  tipo: 'material' | 'servico'
  onAdd: (codigo: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogResult[]>([])
  const [searching, setSearching] = useState(false)

  const rotulo = tipo === 'material' ? 'CATMAT (material)' : 'CATSER (serviço)'

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const timeout = setTimeout(() => {
      api
        .get<CatalogResult[]>(`/api/catalog/search?tipo=${tipo}&q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, tipo])

  function escolher(item: CatalogResult) {
    onAdd(item.codigo)
    setQuery('')
    setResults([])
  }

  return (
    <div className="relative">
      <input
        placeholder={`Buscar ${rotulo} por descrição (ex: cimento, limpeza)`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-sm text-slate-500">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">
              Nada encontrado. (O catálogo precisa estar importado — ver scripts/importCatalogo.ts.)
            </p>
          ) : (
            results.map((item) => (
              <button
                key={item.codigo}
                type="button"
                onClick={() => escolher(item)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
              >
                <span className="font-mono text-xs text-slate-400">{item.codigo}</span>{' '}
                <span className="text-slate-800">{item.descricao}</span>
                {item.classe && <p className="text-xs text-slate-500">{item.classe}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
