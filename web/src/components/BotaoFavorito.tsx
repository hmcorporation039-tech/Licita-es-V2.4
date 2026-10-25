'use client'

import { Star } from 'lucide-react'
import { cx } from '@/components/ui'

// Estrela de "salvar para ver depois". Estado controlado pelo pai (hook
// useFavoritas). Para o clique antes de disparar um Link/linha clicável em
// volta, para favoritar da lista não abrir a licitação.
export default function BotaoFavorito({
  favorita,
  onToggle,
  comTexto = false,
  size = 18,
  className,
}: {
  favorita: boolean
  onToggle: () => void
  comTexto?: boolean
  size?: number
  className?: string
}) {
  const rotulo = favorita ? 'Remover de Minhas salvas' : 'Salvar para ver depois'
  return (
    <button
      type="button"
      aria-pressed={favorita}
      title={rotulo}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded transition-colors',
        favorita ? 'text-accent hover:text-accent/80' : 'text-muted hover:text-ink',
        className,
      )}
    >
      <Star size={size} aria-hidden fill={favorita ? 'currentColor' : 'none'} />
      {comTexto && <span className="text-sm font-medium">{favorita ? 'Salva' : 'Salvar'}</span>}
      <span className="sr-only">{rotulo}</span>
    </button>
  )
}
