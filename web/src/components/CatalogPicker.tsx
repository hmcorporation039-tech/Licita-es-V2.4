'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { api } from '@/lib/api'
import { CatalogResult } from '@/lib/types'
import { Input, cx } from '@/components/ui'

export default function CatalogPicker({
  tipo,
  onAdd,
  id,
  'aria-describedby': descritoPor,
}: {
  tipo: 'material' | 'servico'
  onAdd: (codigo: string) => void
  id?: string
  'aria-describedby'?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogResult[]>([])
  const [searching, setSearching] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const automatico = useId()
  const baseId = id ?? automatico
  const listaId = `${baseId}-lista`

  const rotulo = tipo === 'material' ? 'CATMAT (material)' : 'CATSER (serviço)'
  const aberto = query.trim().length >= 2

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

  useEffect(() => {
    setAtivo(-1)
  }, [results])

  function escolher(item: CatalogResult) {
    onAdd(item.codigo)
    setQuery('')
    setResults([])
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (!aberto) return
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      setAtivo((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault()
      setAtivo((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && ativo >= 0 && results[ativo]) {
      e.preventDefault()
      escolher(results[ativo])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      setResults([])
    }
  }

  const listaVisivel = aberto && !searching && results.length > 0

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listaVisivel}
        aria-controls={listaId}
        aria-activedescendant={listaVisivel && ativo >= 0 ? `${listaId}-${ativo}` : undefined}
        aria-describedby={descritoPor}
        aria-label={id ? undefined : `Buscar ${rotulo} por descrição`}
        autoComplete="off"
        placeholder={tipo === 'material' ? 'Descrição do material' : 'Descrição do serviço'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={aoTeclar}
      />
      {aberto && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-line bg-surface">
          {searching ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Buscando…
            </p>
          ) : results.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Nada encontrado. (O catálogo precisa estar importado — ver scripts/importCatalogo.ts.)
            </p>
          ) : (
            <ul id={listaId} role="listbox" aria-label={`Resultados ${rotulo}`}>
              {results.map((item, i) => (
                <li
                  key={item.codigo}
                  id={`${listaId}-${i}`}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(item)}
                  className={cx('cursor-pointer border-b border-line-soft px-3 py-2 text-sm last:border-0', i === ativo && 'bg-accent-soft')}
                >
                  <span className="font-mono text-xs text-muted">{item.codigo}</span> <span className="text-ink">{item.descricao}</span>
                  {item.classe && <span className="block text-xs text-muted">{item.classe}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
