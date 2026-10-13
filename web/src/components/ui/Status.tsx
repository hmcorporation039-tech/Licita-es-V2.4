import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { cx } from './cx'

export type Tom = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

const TAG: Record<Tom, string> = {
  neutral: 'border-line-strong bg-surface text-ink-2',
  accent: 'border-accent-line bg-accent-soft text-accent',
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  danger: 'border-danger-line bg-danger-soft text-danger',
}

const PONTO: Record<Tom, string> = {
  neutral: 'bg-faint',
  accent: 'bg-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

const TEXTO: Record<Tom, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}

export function toneText(tom: Tom): string {
  return TEXTO[tom]
}

export function StatusTag({ tone = 'neutral', children, dot = false, mono = false, className, title }: { tone?: Tom; children: ReactNode; dot?: boolean; mono?: boolean; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-px text-xs font-medium',
        mono && 'font-mono text-2xs',
        TAG[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', PONTO[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function StatusDot({ tone = 'neutral', children, className }: { tone?: Tom; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm text-ink-2', className)}>
      <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', PONTO[tone])} />
      {children}
    </span>
  )
}

const HORA = 60 * 60 * 1000

export function tomDoPrazo(data: Date | null, agora: Date = new Date()): Tom {
  if (!data) return 'neutral'
  const restante = data.getTime() - agora.getTime()
  if (restante < 0) return 'neutral'
  if (restante <= 48 * HORA) return 'danger'
  if (restante <= 7 * 24 * HORA) return 'warn'
  return 'neutral'
}

export function textoDoPrazo(data: Date | null, agora: Date = new Date()): string {
  if (!data) return 'Sem data'
  const restante = data.getTime() - agora.getTime()
  if (restante < 0) return 'Encerrado'
  const horas = Math.floor(restante / HORA)
  if (horas < 1) return 'em menos de 1 h'
  if (horas <= 48) return `em ${horas} h`
  const dias = Math.round(restante / (24 * HORA))
  return `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

const formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const formatoDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })

export function Prazo({
  data,
  layout = 'stack',
  semHora = false,
  className,
}: {
  data: Date | string | null | undefined
  layout?: 'stack' | 'inline'
  semHora?: boolean
  className?: string
}) {
  const quando = data ? new Date(data) : null
  const valida = quando && !Number.isNaN(quando.getTime()) ? quando : null
  const tom = tomDoPrazo(valida)
  const relativo = textoDoPrazo(valida)
  const absoluto = valida ? (semHora ? formatoDia : formatoData).format(valida).replace(',', '') : '—'

  return (
    <span className={cx('inline-flex min-w-0', layout === 'stack' ? 'flex-col' : 'flex-wrap items-baseline gap-x-2', className)}>
      <span className={cx('inline-flex items-center gap-1.5 text-sm', tom === 'neutral' ? 'text-ink-2' : cx('font-semibold', TEXTO[tom]))}>
        {tom !== 'neutral' && <Clock size={13} strokeWidth={2.25} aria-hidden />}
        {relativo}
      </span>
      {valida && <span className="font-mono text-xs text-muted">{absoluto}</span>}
    </span>
  )
}
