import Link from 'next/link'
import { LinkButton } from '@/components/ui'

export function PublicCard({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <div className="text-sm text-muted">{description}</div>}
      </div>
      <div className="rounded border border-line bg-surface p-5 sm:p-6">{children}</div>
    </div>
  )
}

export function PublicProse({ children }: { children: React.ReactNode }) {
  return <article className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">{children}</article>
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.005em] text-ink">
            <span aria-hidden className="size-3.5 rounded-sm bg-accent" />
            Monitor de Licitações
          </Link>
          <nav aria-label="Conta" className="flex items-center gap-1 sm:gap-2">
            <LinkButton href="/login" variant="ghost" size="sm">
              Entrar
            </LinkButton>
            <LinkButton href="/cadastro" variant="primary" size="sm">
              Teste grátis
            </LinkButton>
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6">
          <span>© Monitor de Licitações · H&amp;M Engenharia e Tecnologia</span>
          <nav aria-label="Documentos legais" className="flex gap-4">
            <Link href="/termos" className="hover:text-ink hover:underline">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-ink hover:underline">
              Política de Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default function PublicShell({ children, estreito = false }: { children: React.ReactNode; estreito?: boolean }) {
  return <div className={estreito ? 'mx-auto w-full max-w-md px-4 py-10' : 'mx-auto w-full max-w-5xl px-4 py-10'}>{children}</div>
}
