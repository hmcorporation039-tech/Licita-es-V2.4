'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import type { SessionUser } from '@/lib/session'

const ABAS = [
  { href: '/admin', label: 'Visão geral', exato: true },
  { href: '/admin/empresas', label: 'Empresas' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/auditoria', label: 'Auditoria' },
  { href: '/admin/uso-ia', label: 'Consumo de IA' },
  { href: '/admin/planos', label: 'Planos' },
]

export function AdminTabs() {
  const pathname = usePathname()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200">
      {ABAS.map((a) => {
        const ativa = a.exato ? pathname === a.href : pathname?.startsWith(a.href)
        return (
          <Link
            key={a.href}
            href={a.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              ativa ? 'border-indigo-700 font-medium text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {a.label}
          </Link>
        )
      })}
    </div>
  )
}

// Moldura comum das telas do administrador: exige sessão de admin e mostra as abas.
// `children` só é renderizado depois que a sessão é validada.
export default function AdminShell({ titulo, children }: { titulo: string; children: (user: SessionUser) => React.ReactNode }) {
  const user = useRequireSession()
  const router = useRouter()

  useEffect(() => {
    if (user && !user.isAdmin) router.replace('/dashboard')
  }, [user, router])

  if (!user || !user.isAdmin) return null

  return (
    <div>
      <AdminTabs />
      <h1 className="mb-4 text-xl font-semibold">{titulo}</h1>
      {children(user)}
    </div>
  )
}
