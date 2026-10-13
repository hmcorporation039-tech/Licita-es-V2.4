import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cx } from './cx'
import type { Tom } from './Status'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
  eyebrow?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, back, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cx('flex flex-col gap-3', className)}>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <div className="text-xs font-medium text-muted">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {description && <div className="text-sm text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  padding?: 'none' | 'md'
  className?: string
  bodyClassName?: string
  children?: ReactNode
  as?: 'section' | 'div'
}

export function Panel({ title, description, actions, padding = 'md', className, bodyClassName, children, as: Tag = 'section' }: PanelProps) {
  return (
    <Tag className={cx('min-w-0 rounded border border-line bg-surface', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(padding === 'md' && 'p-4', bodyClassName)}>{children}</div>
    </Tag>
  )
}

interface MetricProps {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  href?: string
  tone?: 'default' | 'danger' | 'warn'
  className?: string
}

const COR_DO_VALOR = { default: 'text-ink', danger: 'text-danger', warn: 'text-warn' }

export function Metric({ label, value, detail, href, tone = 'default', className }: MetricProps) {
  const conteudo = (
    <>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className={cx('font-mono text-2xl font-medium tracking-tight', COR_DO_VALOR[tone])}>{value}</span>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </>
  )
  const classes = cx('flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5', className)
  if (href) {
    return (
      <Link href={href} className={cx(classes, 'transition-colors hover:bg-sunken')}>
        {conteudo}
      </Link>
    )
  }
  return <div className={classes}>{conteudo}</div>
}

export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none', className)}>
      {children}
    </div>
  )
}

export function EmptyState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-start gap-2 rounded border border-dashed border-line-strong bg-surface px-5 py-8', className)}>
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

const NOTICE: Record<Exclude<Tom, 'neutral'> | 'info', { classes: string; icone: LucideIcon; cor: string }> = {
  info: { classes: 'border-accent-line bg-accent-soft', icone: Info, cor: 'text-accent' },
  accent: { classes: 'border-accent-line bg-accent-soft', icone: Info, cor: 'text-accent' },
  ok: { classes: 'border-ok-line bg-ok-soft', icone: CircleCheck, cor: 'text-ok' },
  warn: { classes: 'border-warn-line bg-warn-soft', icone: TriangleAlert, cor: 'text-warn' },
  danger: { classes: 'border-danger-line bg-danger-soft', icone: CircleAlert, cor: 'text-danger' },
}

interface NoticeProps {
  tone?: keyof typeof NOTICE
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}

export function Notice({ tone = 'info', title, children, action, className }: NoticeProps) {
  const { classes, icone: Icone, cor } = NOTICE[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-3 rounded border px-3.5 py-2.5 text-sm text-ink', classes, className)}>
      <Icone size={16} className={cx('mt-0.5 shrink-0', cor)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, className }: { message: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <Notice
      tone="danger"
      className={className}
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="text-sm font-medium text-danger underline underline-offset-[3px]">
            Tentar de novo
          </button>
        )
      }
    >
      {message}
    </Notice>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded bg-line-soft', className)} />
}

export function Carregando({ linhas = 3, texto = 'Carregando…', className }: { linhas?: number; texto?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cx('flex flex-col gap-2.5', className)}>
      <span className="sr-only">{texto}</span>
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className={cx('h-4', i === linhas - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

export function DescriptionList({ items, columns = 2, className }: { items: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }>; columns?: 1 | 2 | 3 | 4; className?: string }) {
  const grade = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns]
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-3', grade, className)}>
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className={cx('text-sm text-ink break-words', item.mono && 'font-mono')}>{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
