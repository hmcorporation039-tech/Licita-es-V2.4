import Link from 'next/link'
import { LinkButton } from '@/components/ui'

export default function NaoEncontrada() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.005em] text-ink">
            <span aria-hidden className="size-3.5 rounded-sm bg-accent" />
            Monitor de Licitações
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-4 py-16 sm:py-24">
        <p className="font-mono text-sm text-muted">Erro 404</p>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Página não encontrada</h1>
        <p className="text-base text-ink-2">O endereço pode ter mudado ou a licitação pode ter sido removida da base. Volte ao painel ou à lista de licitações.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <LinkButton href="/dashboard" variant="primary">
            Ir para o painel
          </LinkButton>
          <LinkButton href="/tenders" variant="secondary">
            Ver licitações
          </LinkButton>
        </div>
      </main>
    </div>
  )
}
