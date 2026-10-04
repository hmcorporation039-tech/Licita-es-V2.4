'use client'

import { useState } from 'react'
import type { Aderencia } from '@/lib/adminTypes'

const COR_DA_FAIXA: Record<Aderencia['faixa'], string> = {
  alta: 'bg-emerald-100 text-emerald-800',
  boa: 'bg-sky-100 text-sky-800',
  media: 'bg-amber-100 text-amber-800',
  baixa: 'bg-slate-200 text-slate-700',
}

const ROTULO_DA_FAIXA: Record<Aderencia['faixa'], string> = {
  alta: 'aderência alta',
  boa: 'aderência boa',
  media: 'aderência média',
  baixa: 'aderência baixa',
}

// Nota de aderência (0–100) com o motivo de cada critério, que se abre ao clicar.
export default function NotaDeAderencia({ aderencia }: { aderencia: Aderencia }) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_DA_FAIXA[aderencia.faixa]}`}
      >
        <span className="font-semibold">{aderencia.nota}</span>
        <span>/ 100 · {ROTULO_DA_FAIXA[aderencia.faixa]}</span>
        <span aria-hidden="true">{aberto ? '▴' : '▾'}</span>
      </button>

      {aberto && (
        <ul className="mt-2 flex flex-col gap-1.5 rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          {aderencia.criterios.map((c) => (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800">{c.rotulo}</span>
                <span>
                  {c.pontos} / {c.maximo}
                </span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded bg-slate-100">
                <div className="h-full bg-indigo-500" style={{ width: `${Math.round((c.pontos / c.maximo) * 100)}%` }} />
              </div>
              <p className="mt-0.5">{c.motivo}</p>
            </li>
          ))}
          <li className="border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
            A nota mede o que o sistema sabe hoje (objeto, prazo, valor e localização). Ela muda conforme o prazo se aproxima e não
            avalia a sua capacidade técnica ou financeira para a licitação.
          </li>
        </ul>
      )}
    </div>
  )
}
