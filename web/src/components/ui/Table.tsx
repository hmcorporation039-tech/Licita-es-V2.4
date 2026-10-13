import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'

export function TableWrap({ children, className, minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cx('min-w-0 overflow-x-auto rounded border border-line bg-surface', className)}>
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  )
}

export function Table({ className, ...rest }: ComponentProps<'table'>) {
  return <table className={cx('w-full border-collapse text-left text-sm', className)} {...rest} />
}

export function THead({ className, ...rest }: ComponentProps<'thead'>) {
  return <thead className={cx('bg-sunken', className)} {...rest} />
}

export function Th({ className, align = 'left', ...rest }: ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cx(
        'h-9 whitespace-nowrap border-b border-line px-3 text-xs font-semibold text-muted first:pl-4 last:pr-4',
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
      className={cx('border-b border-line-soft last:border-0', selected && 'bg-accent-soft', interactive && !selected && 'hover:bg-sunken', className)}
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
