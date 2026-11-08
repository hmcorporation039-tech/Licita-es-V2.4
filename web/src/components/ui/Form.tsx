'use client'

import { cloneElement, isValidElement, useId, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cx } from './cx'

const CONTROLE =
  'w-full rounded-lg border border-line-strong bg-surface text-[16px] text-ink transition-[border-color,box-shadow] placeholder:text-faint hover:border-accent-line focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15 sm:text-sm'

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(CONTROLE, 'h-10 px-3', className)} {...rest} />
}

/** Campo de senha com o "olhinho" para conferir o que foi digitado. */
export function InputDeSenha({ className, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <Input {...rest} type={visivel ? 'text' : 'password'} spellCheck={false} autoCapitalize="none" autoCorrect="off" className={cx('pr-10', className)} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-ink focus-visible:text-ink focus-visible:outline-none"
      >
        {visivel ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  )
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cx(CONTROLE, 'h-10 px-2.5', className)} {...rest} />
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(CONTROLE, 'min-h-24 px-3 py-2 leading-relaxed', className)} {...rest} />
}

export function Checkbox({ label, hint, className, ...rest }: ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-start gap-2.5 text-sm text-ink', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent" {...rest} />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  id?: string
  className?: string
  children: ReactNode
}

type PropsDeControle = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }

export function Field({ label, hint, error, required, id, className, children }: FieldProps) {
  const automatico = useId()
  const controleId = id ?? automatico
  const dicaId = `${controleId}-dica`
  const erroId = `${controleId}-erro`
  const descritoPor = [hint ? dicaId : null, error ? erroId : null].filter(Boolean).join(' ') || undefined

  const controle = isValidElement(children)
    ? cloneElement(children as ReactElement<PropsDeControle>, {
        id: (children as ReactElement<PropsDeControle>).props.id ?? controleId,
        'aria-describedby': descritoPor,
        'aria-invalid': error ? true : undefined,
        required: (children as ReactElement<PropsDeControle>).props.required ?? required,
      })
    : children

  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={controleId} className="text-xs font-semibold text-ink-2">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {controle}
      {hint && !error && (
        <p id={dicaId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={erroId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function FormError({ children, className }: { children?: ReactNode; className?: string }) {
  if (!children) return null
  return (
    <p role="alert" className={cx('text-sm font-medium text-danger', className)}>
      {children}
    </p>
  )
}
