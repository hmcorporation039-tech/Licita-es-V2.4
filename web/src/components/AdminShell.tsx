'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import type { SessionUser } from '@/lib/session'
import { PageHeader, TabLinks } from '@/components/ui'

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
    <TabLinks
      label="Seções da administração"
      items={ABAS.map((a) => ({
        href: a.href,
        label: a.label,
        active: a.exato ? pathname === a.href : Boolean(pathname?.startsWith(a.href)),
      }))}
    />
  )
}

export function AdminCabecalho({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Administração" title={titulo} />
      <AdminTabs />
    </div>
  )
}

export default function AdminShell({ titulo, children }: { titulo: string; children: (user: SessionUser) => ReactNode }) {
  const user = useRequireSession()
  const router = useRouter()

  useEffect(() => {
    if (user && !user.isAdmin) router.replace('/dashboard')
  }, [user, router])

  if (!user || !user.isAdmin) return null

  return (
    <>
      <AdminCabecalho titulo={titulo} />
      {children(user)}
    </>
  )
}
