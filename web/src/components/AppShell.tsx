'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Bookmark,
  Building2,
  FileText,
  Inbox,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Radar,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { clearSessionUser, getSessionUser, type SessionUser } from '@/lib/session'
import { api } from '@/lib/api'
import { MedidorNoMenu } from '@/components/MedidorDeAnalises'
import { cx } from '@/components/ui'

interface ItemDeMenu {
  href: string
  label: string
  icon: LucideIcon
}

interface GrupoDeMenu {
  nome: string
  itens: ItemDeMenu[]
  soAdmin?: boolean
}

const GRUPOS: GrupoDeMenu[] = [
  {
    nome: 'Operação',
    itens: [
      { href: '/dashboard', label: 'Painel', icon: LayoutGrid },
      { href: '/tenders', label: 'Licitações', icon: FileText },
      { href: '/matches', label: 'Meus matches', icon: Inbox },
      { href: '/escolhidas', label: 'Escolhidas', icon: Bookmark },
      { href: '/radar', label: 'Radar', icon: Radar },
    ],
  },
  {
    nome: 'Empresa',
    itens: [
      { href: '/items', label: 'Itens monitorados', icon: ListChecks },
      { href: '/empresa', label: 'Empresa e documentos', icon: Building2 },
      { href: '/conta', label: 'Conta', icon: UserRound },
    ],
  },
  { nome: 'Ajuda', itens: [{ href: '/guia', label: 'Guia', icon: BookOpen }] },
  { nome: 'Plataforma', soAdmin: true, itens: [{ href: '/admin', label: 'Administração', icon: ShieldCheck }] },
]

function Marca() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded px-2 py-1 text-sm font-semibold tracking-[-0.005em] text-ink">
      <span aria-hidden className="size-3.5 rounded-sm bg-accent" />
      Monitor de Licitações
    </Link>
  )
}

function Navegacao({ user, pathname }: { user: SessionUser | null; pathname: string | null }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {GRUPOS.filter((g) => !g.soAdmin || user?.isAdmin).map((grupo) => (
        <div key={grupo.nome} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-faint">{grupo.nome}</p>
          {grupo.itens.map(({ href, label, icon: Icone }) => {
            const ativo = pathname === href || pathname?.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cx(
                  'flex h-8 items-center gap-2.5 rounded px-2 text-sm transition-colors',
                  ativo ? 'bg-accent-soft font-semibold text-accent shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-ink-2 hover:bg-line-soft hover:text-ink',
                )}
              >
                <Icone size={16} strokeWidth={ativo ? 2 : 1.75} className={ativo ? 'text-accent' : 'text-faint'} aria-hidden />
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Rodape({ user, onSair }: { user: SessionUser | null; onSair: () => void }) {
  if (!user) return null
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <MedidorNoMenu />
      <div className="flex items-center justify-between gap-2 px-2">
        <Link href="/conta" className="min-w-0 text-xs leading-4 text-muted hover:text-ink">
          <span className="block truncate font-medium text-ink">{user.name ?? user.email}</span>
          {user.name && <span className="block truncate">{user.email}</span>}
        </Link>
        <button type="button" onClick={onSair} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted hover:bg-line-soft hover:text-danger">
          <LogOut size={14} aria-hidden />
          Sair
        </button>
      </div>
    </div>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setUser(getSessionUser())
    setMenuAberto(false)
  }, [pathname])

  useEffect(() => {
    if (!menuAberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [menuAberto])

  async function sair() {
    try {
      await api.post('/api/auth/logout')
    } catch {}
    clearSessionUser()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-sunken px-3 lg:hidden">
        <Marca />
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
          className="inline-flex size-10 items-center justify-center rounded text-ink-2 hover:bg-line-soft"
        >
          <Menu size={20} aria-hidden />
        </button>
      </header>

      {menuAberto && <div aria-hidden className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMenuAberto(false)} />}

      <aside
        id="menu-lateral"
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col gap-6 overflow-y-auto border-r border-line bg-sunken px-3 py-4 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[232px] lg:translate-x-0',
          menuAberto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between">
          <Marca />
          <button type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="inline-flex size-9 items-center justify-center rounded text-muted hover:bg-line-soft lg:hidden">
            <X size={18} aria-hidden />
          </button>
        </div>
        <Navegacao user={user} pathname={pathname} />
        <div className="mt-auto">
          <Rodape user={user} onSair={sair} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">{children}</div>
      </main>
    </div>
  )
}
