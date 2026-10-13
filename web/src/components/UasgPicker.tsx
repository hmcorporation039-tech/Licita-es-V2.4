'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { UasgResult } from '@/lib/types'
import { Input, cx } from '@/components/ui'

export default function UasgPicker({
  selected,
  onChange,
  onPickOrgao,
  id,
  'aria-describedby': descritoPor,
}: {
  selected: UasgResult[]
  onChange: (next: UasgResult[]) => void
  onPickOrgao?: (nomeOrgao: string) => void
  id?: string
  'aria-describedby'?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UasgResult[]>([])
  const [searching, setSearching] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const automatico = useId()
  const baseId = id ?? automatico
  const listaId = `${baseId}-lista`
  const aberto = query.trim().length >= 2

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

  useEffect(() => {
    setAtivo(-1)
  }, [results])

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
      adicionar(results[ativo])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      setResults([])
    }
  }

  const listaVisivel = aberto && !searching && results.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listaVisivel}
          aria-controls={listaId}
          aria-activedescendant={listaVisivel && ativo >= 0 ? `${listaId}-${ativo}` : undefined}
          aria-describedby={descritoPor}
          aria-label={id ? undefined : 'Buscar UASG por nome, órgão ou código'}
          autoComplete="off"
          placeholder="Buscar UASG por nome, órgão ou código (opcional — só afeta licitações do ComprasNet)"
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
                Nenhuma UASG encontrada.
              </p>
            ) : (
              <ul id={listaId} role="listbox" aria-label="Resultados de UASG">
                {results.map((u, i) => (
                  <li
                    key={u.codigoUasg}
                    id={`${listaId}-${i}`}
                    role="option"
                    aria-selected={i === ativo}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => adicionar(u)}
                    className={cx('cursor-pointer border-b border-line-soft px-3 py-2 text-sm last:border-0', i === ativo && 'bg-accent-soft')}
                  >
                    <span className="font-medium text-ink">{u.nomeUasg}</span> <span className="font-mono text-xs text-muted">{u.codigoUasg}</span>
                    <span className="block text-xs text-muted">
                      {u.nomeOrgao ?? 'Órgão n/d'} — {u.municipioNome ?? 'n/d'}/{u.siglaUf ?? 'n/d'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="UASGs escolhidas">
          {selected.map((u) => (
            <li key={u.codigoUasg} className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line-strong bg-surface py-px pl-1.5 pr-0.5 text-xs text-ink-2">
              <span className="truncate">{u.nomeUasg}</span>
              <span className="font-mono text-2xs text-muted">{u.codigoUasg}</span>
              <button
                type="button"
                onClick={() => remover(u.codigoUasg)}
                aria-label={`Remover UASG ${u.nomeUasg} (${u.codigoUasg})`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-line-soft hover:text-danger"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
