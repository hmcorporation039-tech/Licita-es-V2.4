import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
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
        <Link href={back.href} className="inline-flex items-center gap-1.5 self-start rounded-full text-sm font-semibold text-accent hover:text-accent-hover">
          <ArrowLeft size={16} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <div className="text-xs font-semibold text-muted">{eyebrow}</div>}
          <h1 className="font-display text-2xl font-bold tracking-[-0.015em] text-ink sm:text-[1.75rem] sm:font-extrabold sm:leading-9">{title}</h1>
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
    <Tag className={cx('min-w-0 rounded-xl border border-line bg-surface shadow-cartao', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(padding === 'md' && 'p-4', bodyClassName)}>{children}</div>
    </Tag>
  )
}

export type CorDoCartao = 'accent' | 'ceu' | 'violeta' | 'ok' | 'warn' | 'danger'

interface MetricProps {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  href?: string
  tone?: 'default' | 'danger' | 'warn'
  icon?: LucideIcon
  color?: CorDoCartao
  className?: string
}

const COR_DO_VALOR = { default: 'text-ink', danger: 'text-danger', warn: 'text-warn' }

const COR_DO_CARTAO: Record<CorDoCartao, { faixa: string; icone: string }> = {
  accent: { faixa: 'before:bg-accent', icone: 'bg-accent-soft text-accent' },
  ceu: { faixa: 'before:bg-ceu', icone: 'bg-ceu-soft text-ceu' },
  violeta: { faixa: 'before:bg-violeta', icone: 'bg-violeta-soft text-violeta' },
  ok: { faixa: 'before:bg-ok', icone: 'bg-ok-soft text-ok' },
  warn: { faixa: 'before:bg-warn', icone: 'bg-warn-soft text-warn' },
  danger: { faixa: 'before:bg-danger', icone: 'bg-danger-soft text-danger' },
}

export function Metric({ label, value, detail, href, tone = 'default', icon: Icone, color, className }: MetricProps) {
  const cor = COR_DO_CARTAO[color ?? (tone === 'default' ? 'accent' : tone)]
  const conteudo = (
    <>
      <span className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5">
        {Icone && (
          <span aria-hidden className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-lg', cor.icone)}>
            <Icone size={16} strokeWidth={2} />
          </span>
        )}
        <span className="min-w-0 text-xs font-semibold text-muted">{label}</span>
      </span>
      <span className={cx('font-display text-[1.75rem] font-extrabold leading-9 tracking-[-0.01em] tabular-nums', COR_DO_VALOR[tone])}>{value}</span>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </>
  )
  const classes = cx(
    'relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-line bg-surface px-4 pb-3.5 pt-4 shadow-cartao before:absolute before:inset-x-0 before:top-0 before:h-[3px]',
    cor.faixa,
    className,
  )
  if (href) {
    return (
      <Link href={href} className={cx(classes, 'transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-accent-line hover:shadow-cartao-alto')}>
        {conteudo}
      </Link>
    )
  }
  return <div className={classes}>{conteudo}</div>
}

export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-2 gap-3 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none', className)}>{children}</div>
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icone = Sparkles,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-start gap-3 rounded-xl border border-dashed border-accent-line bg-accent-soft/40 px-5 py-6 sm:flex-row sm:gap-4', className)}>
      <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent shadow-cartao">
        <Icone size={18} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="font-display text-base font-bold text-ink">{title}</p>
        {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
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
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm text-ink', classes, className)}>
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
  return <div aria-hidden className={cx('animate-pulse rounded-md bg-line-soft', className)} />
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
