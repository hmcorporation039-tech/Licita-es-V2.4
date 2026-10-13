'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ResumoDeCotas } from '@/lib/adminTypes'
import { Carregando, ErrorState, Panel, StatusTag, cx } from '@/components/ui'

export default function UsoDoPlano() {
  const [dados, setDados] = useState<ResumoDeCotas | null>(null)
  const [erro, setErro] = useState(false)

  const carregar = useCallback(() => {
    setErro(false)
    api.get<ResumoDeCotas>('/api/company/usage').then(setDados).catch(() => setErro(true))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro) return <ErrorState message="Não foi possível carregar o uso do seu plano." onRetry={carregar} />
  if (!dados) {
    return (
      <Panel title="Seu plano">
        <Carregando texto="Carregando plano…" />
      </Panel>
    )
  }

  return (
    <Panel title="Seu plano" actions={<StatusTag>{dados.plano.nome}</StatusTag>}>
      <ul className="flex flex-col gap-3.5">
        {dados.recursos.map((r) => {
          const pct = r.limite === null ? 0 : r.limite === 0 ? 100 : Math.min(100, Math.round((r.usado / r.limite) * 100))
          const cor = r.excedido ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-accent'
          return (
            <li key={r.recurso} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-2 first-letter:uppercase">{r.rotulo}</span>
                <span className={cx('shrink-0 text-xs', r.excedido ? 'text-danger' : 'text-muted')}>
                  <span className="font-mono">{r.usado}</span> / {r.limite === null ? 'ilimitado' : <span className="font-mono">{r.limite}</span>}
                </span>
              </div>
              {r.limite !== null && (
                <div
                  className="h-1 overflow-hidden rounded-sm bg-line-soft"
                  role="progressbar"
                  aria-label={r.rotulo}
                  aria-valuenow={r.usado}
                  aria-valuemin={0}
                  aria-valuemax={r.limite}
                >
                  <div className={cx('h-full', cor)} style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {dados.recursos.some((r) => r.excedido) && (
        <p className="mt-3.5 text-xs text-danger">Você atingiu um limite do plano. Fale com o administrador para ampliá-lo.</p>
      )}
    </Panel>
  )
}
