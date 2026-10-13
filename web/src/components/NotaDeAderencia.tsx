'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Aderencia } from '@/lib/adminTypes'
import { StatusTag, type Tom } from '@/components/ui'

const TOM_DA_FAIXA: Record<Aderencia['faixa'], Tom> = {
  alta: 'ok',
  boa: 'accent',
  media: 'warn',
  baixa: 'neutral',
}

const ROTULO_DA_FAIXA: Record<Aderencia['faixa'], string> = {
  alta: 'aderência alta',
  boa: 'aderência boa',
  media: 'aderência média',
  baixa: 'aderência baixa',
}

export default function NotaDeAderencia({ aderencia }: { aderencia: Aderencia }) {
  const [aberto, setAberto] = useState(false)
  const Seta = aberto ? ChevronUp : ChevronDown

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="inline-flex max-w-full rounded-sm">
        <StatusTag tone={TOM_DA_FAIXA[aderencia.faixa]}>
          <span className="inline-flex items-center gap-1">
            <span className="font-mono font-semibold">{aderencia.nota}</span>
            <span>/ 100 · {ROTULO_DA_FAIXA[aderencia.faixa]}</span>
            <Seta size={12} aria-hidden />
          </span>
        </StatusTag>
      </button>

      {aberto && (
        <ul className="mt-2 flex flex-col gap-2 rounded border border-line bg-surface p-3 text-xs text-ink-2">
          {aderencia.criterios.map((c) => (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">{c.rotulo}</span>
                <span className="font-mono text-muted">
                  {c.pontos} / {c.maximo}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={c.rotulo}
                aria-valuemin={0}
                aria-valuemax={c.maximo}
                aria-valuenow={c.pontos}
                className="h-1 overflow-hidden rounded-sm bg-line-soft"
              >
                <div className="h-full bg-accent" style={{ width: `${Math.round((c.pontos / c.maximo) * 100)}%` }} />
              </div>
              <p>{c.motivo}</p>
            </li>
          ))}
          <li className="border-t border-line-soft pt-2 text-2xs text-muted">
            A nota mede o que o sistema sabe hoje (objeto, prazo, valor e localização). Ela muda conforme o prazo se aproxima e não avalia a sua capacidade
            técnica ou financeira para a licitação.
          </li>
        </ul>
      )}
    </div>
  )
}
