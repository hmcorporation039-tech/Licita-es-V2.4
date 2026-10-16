import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'

export function TableWrap({ children, className, minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cx('relative min-w-0 overflow-x-auto rounded-xl border border-line bg-surface shadow-cartao', className)}>
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  )
}

export function Table({ className, ...rest }: ComponentProps<'table'>) {
  return <table className={cx('tabela w-full border-collapse text-left text-sm', className)} {...rest} />
}

export function THead({ className, ...rest }: ComponentProps<'thead'>) {
  return <thead className={cx('bg-accent-soft/55', className)} {...rest} />
}

export function Th({ className, align = 'left', ...rest }: ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cx(
        'h-10 whitespace-nowrap border-b border-line px-3 text-2xs font-bold uppercase tracking-[0.05em] text-muted first:pl-4 last:pr-4',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...rest}
    />
  )
}

export function Tr({ className, selected = false, interactive = false, ...rest }: ComponentProps<'tr'> & { selected?: boolean; interactive?: boolean }) {
  return (
    <tr
      className={cx('border-b border-line-soft transition-colors last:border-0', selected && 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]', interactive && !selected && 'cursor-pointer hover:bg-accent-soft/70', className)}
      {...rest}
    />
  )
}

export function Td({ className, numeric = false, muted = false, ...rest }: ComponentProps<'td'> & { numeric?: boolean; muted?: boolean }) {
  return (
    <td
      className={cx(
        'px-3 py-2.5 align-middle first:pl-4 last:pr-4',
        numeric && 'whitespace-nowrap text-right font-mono',
        muted && 'text-muted',
        className,
      )}
      {...rest}
    />
  )
}
