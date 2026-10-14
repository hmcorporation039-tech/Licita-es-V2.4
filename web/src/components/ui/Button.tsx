import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded border font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

const VARIANTES: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border-line-strong bg-surface text-ink hover:border-faint hover:bg-sunken',
  ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-line-soft hover:text-ink',
  danger: 'border-danger-line bg-surface text-danger hover:border-danger hover:bg-danger-soft',
}

const TAMANHOS: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-10 px-3.5 text-sm',
}

const TAMANHO_ICONE: Record<ButtonSize, number> = { sm: 14, md: 16 }

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cx(BASE, VARIANTES[variant], TAMANHOS[size], className)
}

interface Visual {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  iconRight?: LucideIcon
}

function Conteudo({ icon: Icone, iconRight: IconeDireita, size = 'md', loading, children }: Visual & { loading?: boolean; children?: ReactNode }) {
  const tamanho = TAMANHO_ICONE[size]
  return (
    <>
      {loading ? <Loader2 size={tamanho} className="animate-spin" aria-hidden /> : Icone && <Icone size={tamanho} aria-hidden />}
      {children}
      {IconeDireita && <IconeDireita size={tamanho} aria-hidden />}
    </>
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: ComponentProps<'button'> & Visual & { loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses(variant, size, className)} {...rest}>
      <Conteudo icon={icon} iconRight={iconRight} size={size} loading={loading}>
        {children}
      </Conteudo>
    </button>
  )
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & Visual) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      <Conteudo icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Conteudo>
    </Link>
  )
}

export function TextLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link className={cx('font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent', className)} {...rest} />
}
