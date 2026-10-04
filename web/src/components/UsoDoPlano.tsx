'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ResumoDeCotas } from '@/lib/adminTypes'

// Mostra o plano da empresa e quanto de cada limite já foi usado.
export default function UsoDoPlano() {
  const [dados, setDados] = useState<ResumoDeCotas | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    api.get<ResumoDeCotas>('/api/company/usage').then(setDados).catch(() => setErro(true))
  }, [])

  if (erro) return null
  if (!dados) return <p className="text-sm text-slate-500">Carregando plano...</p>

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-800">Seu plano</h2>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{dados.plano.nome}</span>
      </div>
      <ul className="flex flex-col gap-3">
        {dados.recursos.map((r) => {
          const pct = r.limite === null ? 0 : r.limite === 0 ? 100 : Math.min(100, Math.round((r.usado / r.limite) * 100))
          const cor = r.excedido ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-600'
          return (
            <li key={r.recurso}>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span className="capitalize">{r.rotulo}</span>
                <span>
                  {r.usado} / {r.limite === null ? 'ilimitado' : r.limite}
                </span>
              </div>
              {r.limite !== null && (
                <div className="h-1.5 overflow-hidden rounded bg-slate-100">
                  <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {dados.recursos.some((r) => r.excedido) && (
        <p className="mt-3 text-xs text-red-600">Você atingiu um limite do plano. Fale com o administrador para ampliá-lo.</p>
      )}
    </div>
  )
}
