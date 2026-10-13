'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'

export interface Aba<T extends string> {
  id: T
  label: ReactNode
  count?: number
}

const ABA =
  '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 text-sm transition-colors'
const ATIVA = 'border-accent font-semibold text-accent'
const INATIVA = 'border-transparent text-muted hover:border-line-strong hover:text-ink'

function Contador({ n }: { n?: number }) {
  if (n === undefined) return null
  return <span className="rounded-sm bg-line-soft px-1 font-mono text-2xs text-muted">{n}</span>
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Aba<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const atual = tabs.findIndex((t) => t.id === value)
    let proxima = -1
    if (e.key === 'ArrowRight') proxima = (atual + 1) % tabs.length
    if (e.key === 'ArrowLeft') proxima = (atual - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') proxima = 0
    if (e.key === 'End') proxima = tabs.length - 1
    if (proxima < 0) return
    e.preventDefault()
    onChange(tabs[proxima].id)
    refs.current[proxima]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={aoTeclar} className={cx('flex gap-6 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t, i) => {
        const ativa = t.id === value
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`aba-${t.id}`}
            aria-selected={ativa}
            tabIndex={ativa ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cx(ABA, ativa ? ATIVA : INATIVA)}
          >
            {t.label}
            <Contador n={t.count} />
          </button>
        )
      })}
    </div>
  )
}

export function TabLinks({ items, label, className }: { items: Array<{ href: string; label: ReactNode; active: boolean; count?: number }>; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx('flex gap-6 overflow-x-auto border-b border-line', className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} className={cx(ABA, item.active ? ATIVA : INATIVA)}>
          {item.label}
          <Contador n={item.count} />
        </Link>
      ))}
    </nav>
  )
}

export function useAbaNaUrl<T extends string>(validas: readonly T[], padrao: T, parametro = 'aba'): [T, (aba: T) => void] {
  const [aba, setAba] = useState<T>(padrao)
  const validasRef = useRef(validas)

  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get(parametro)
    if (daUrl && (validasRef.current as readonly string[]).includes(daUrl)) setAba(daUrl as T)
  }, [parametro])

  const mudar = useCallback(
    (nova: T) => {
      setAba(nova)
      const url = new URL(window.location.href)
      url.searchParams.set(parametro, nova)
      window.history.replaceState(window.history.state, '', url)
    },
    [parametro],
  )

  return [aba, mudar]
}
