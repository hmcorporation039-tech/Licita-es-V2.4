'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Bookmark,
  Building2,
  Coins,
  KeyRound,
  FileText,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Radar,
  ShieldCheck,
  Star,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { clearSessionUser, getSessionUser, type SessionUser } from '@/lib/session'
import { api } from '@/lib/api'
import { MedidorNoMenu } from '@/components/MedidorDeAnalises'
import InstalarApp from '@/components/InstalarApp'
import { PrazoDoAcessoNoMenu } from '@/components/PrazoDoAcesso'
import Bela, { BotaoDaBela } from '@/components/Bela'
import { cx } from '@/components/ui'
import AvisoDeTermos from '@/components/AvisoDeTermos'
import { desligarAoSair, sincronizarEsteAparelho } from '@/lib/notificacaoNoCelular'
import { lembrarTela } from '@/lib/suporte'
import CapturaDeErros from '@/components/CapturaDeErros'

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
      { href: '/salvas', label: 'Minhas salvas', icon: Star },
      { href: '/radar', label: 'Radar', icon: Radar },
    ],
  },
  {
    nome: 'Empresa',
    itens: [
      { href: '/items', label: 'Itens monitorados', icon: ListChecks },
      { href: '/empresa', label: 'Empresa e documentos', icon: Building2 },
      { href: '/base-de-precos', label: 'Base de preços', icon: Coins },
      { href: '/portais', label: 'Meus Portais', icon: KeyRound },
      { href: '/conta', label: 'Conta', icon: UserRound },
    ],
  },
  {
    nome: 'Ajuda',
    itens: [
      { href: '/guia', label: 'Guia', icon: BookOpen },
      { href: '/suporte', label: 'Suporte', icon: LifeBuoy },
    ],
  },
  { nome: 'Plataforma', soAdmin: true, itens: [{ href: '/admin', label: 'Administração', icon: ShieldCheck }] },
]

function Marca() {
  return (
    <Link href="/dashboard" className="whitespace-nowrap rounded-lg px-2 py-1 font-display text-lg leading-none tracking-[-0.02em] text-nav-ink focus-visible:outline-white">
      <span className="font-black">Licita</span> <span className="font-light text-nav-muted">Bela</span>
    </Link>
  )
}

function Navegacao({ user, pathname }: { user: SessionUser | null; pathname: string | null }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {GRUPOS.filter((g) => !g.soAdmin || user?.isAdmin).map((grupo) => (
        <div key={grupo.nome} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-2xs font-bold uppercase tracking-[0.08em] text-nav-muted">{grupo.nome}</p>
          {grupo.itens.map(({ href, label, icon: Icone }) => {
            const ativo = pathname === href || pathname?.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-white',
                  ativo ? 'bg-surface font-bold text-accent shadow-[0_2px_8px_rgb(3_28_85/0.25)]' : 'font-medium text-nav-ink/90 hover:bg-white/12 hover:text-nav-ink',
                )}
              >
                <Icone size={17} strokeWidth={ativo ? 2.25 : 1.85} className={ativo ? 'text-accent' : 'text-nav-muted'} aria-hidden />
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
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-2 text-ink shadow-[0_6px_18px_rgb(3_28_85/0.3)]">
      <PrazoDoAcessoNoMenu />
      <MedidorNoMenu />
      <div className="flex items-center justify-between gap-2 px-2">
        <Link href="/conta" title={user.email} className="min-w-0 text-xs leading-4 text-muted hover:text-ink">
          <span className="block truncate font-medium text-ink">{user.name ?? user.email}</span>
          {user.name && <span className="block truncate">{user.email}</span>}
        </Link>
        <button type="button" onClick={onSair} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-danger-soft hover:text-danger">
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
  const [belaAberta, setBelaAberta] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setUser(getSessionUser())
    setMenuAberto(false)
    setBelaAberta(false)
    if (pathname) lembrarTela(pathname)
  }, [pathname])

  useEffect(() => {
    if (!menuAberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [menuAberto])

  useEffect(() => {
    const sessao = getSessionUser()
    if (sessao) sincronizarEsteAparelho(sessao.id).catch(() => undefined)
  }, [])

  async function sair() {
    await desligarAoSair()
    try {
      await api.post('/api/auth/logout')
    } catch {}
    clearSessionUser()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 bg-nav-2 px-2 shadow-[0_2px_10px_rgb(3_28_85/0.25)] sm:px-3 lg:hidden">
        <Marca />
        <div className="flex shrink-0 items-center gap-1">
          <BotaoDaBela onAbrir={() => setBelaAberta(true)} className="h-11 focus-visible:outline-white" />
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
            aria-controls="menu-lateral"
            className="inline-flex size-11 items-center justify-center rounded-lg text-nav-ink hover:bg-white/15 focus-visible:outline-white"
          >
            <Menu size={20} aria-hidden />
          </button>
        </div>
      </header>

      {menuAberto && <div aria-hidden className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={() => setMenuAberto(false)} />}

      <aside
        id="menu-lateral"
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col gap-5 overflow-y-auto bg-[linear-gradient(180deg,var(--color-nav-2)_0%,var(--color-nav)_100%)] px-3 py-4 text-nav-ink transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[244px] lg:translate-x-0',
          menuAberto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between">
          <Marca />
          <button type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="inline-flex size-11 items-center justify-center rounded-lg text-nav-ink hover:bg-white/15 focus-visible:outline-white lg:hidden">
            <X size={18} aria-hidden />
          </button>
        </div>
        <BotaoDaBela
          onAbrir={() => {
            setMenuAberto(false)
            setBelaAberta(true)
          }}
          rotulo="Falar com a Bela"
          detalhe="Busca por voz ou texto"
          className="w-full rounded-xl py-1.5 pl-1.5"
        />
        <Navegacao user={user} pathname={pathname} />
        <div className="mt-auto flex flex-col gap-3">
          <InstalarApp />
          <Rodape user={user} onSair={sair} />
        </div>
      </aside>

      <Bela aberta={belaAberta} onFechar={() => setBelaAberta(false)} />
      <CapturaDeErros />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">
          <AvisoDeTermos />
          {children}
        </div>
      </main>
    </div>
  )
}
