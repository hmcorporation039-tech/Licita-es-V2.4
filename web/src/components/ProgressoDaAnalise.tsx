'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

const PASSOS = [
  'Baixando o edital e os anexos',
  'Lendo os documentos',
  'Analisando exigências, prazos e riscos',
  'Conferência em dupla (uma segunda IA revisa)',
] as const

const ULTIMO_PASSO_DO_PROCESSAMENTO = 2
const AVANCO_MS = 7000

export default function ProgressoDaAnalise({ revisando }: { revisando: boolean }) {
  const [passo, setPasso] = useState(0)

  useEffect(() => {
    if (revisando) return
    const relogio = setInterval(() => setPasso((p) => Math.min(p + 1, ULTIMO_PASSO_DO_PROCESSAMENTO)), AVANCO_MS)
    return () => clearInterval(relogio)
  }, [revisando])

  const ativo = revisando ? PASSOS.length - 1 : passo

  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-prose flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
      <p className="text-sm font-medium text-ink">Analisando o edital. Leva alguns segundos — pode deixar a página aberta.</p>
      <ol className="flex flex-col gap-2.5">
        {PASSOS.map((titulo, i) => {
          const concluido = i < ativo
          const atual = i === ativo
          return (
            <li key={titulo} className="flex items-center gap-2.5">
              <span
                className={
                  concluido
                    ? 'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok'
                    : atual
                      ? 'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent'
                      : 'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line text-muted'
                }
              >
                {concluido ? <Check size={13} strokeWidth={3} aria-hidden /> : atual ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
              </span>
              <span className={concluido ? 'text-sm text-ink-2' : atual ? 'text-sm font-medium text-ink' : 'text-sm text-muted'}>{titulo}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
