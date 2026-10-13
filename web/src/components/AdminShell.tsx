'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api } from '@/lib/api'
import type { PlanoComercial } from '@/lib/adminTypes'
import type { SessionUser } from '@/lib/session'
import { PageHeader, StatusTag, TabLinks, cx } from '@/components/ui'

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

export function useNomesDosPlanos(): Record<string, string> {
  const [nomes, setNomes] = useState<Record<string, string>>({})
  useEffect(() => {
    let ativo = true
    api
      .get<PlanoComercial[]>('/api/admin/plans')
      .then((planos) => {
        if (ativo) setNomes(Object.fromEntries(planos.map((p) => [p.code, p.name])))
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])
  return nomes
}

const comoCodigo = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

export function RotuloDoPlano({ codigo, nome, sempreMostrarCodigo = false, className }: { codigo: string; nome?: string | null; sempreMostrarCodigo?: boolean; className?: string }) {
  const mostrarCodigo = Boolean(nome) && (sempreMostrarCodigo || comoCodigo(nome ?? '') !== codigo)
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <StatusTag title={nome ? `Código do plano: ${codigo}` : undefined}>{nome || codigo}</StatusTag>
      {mostrarCodigo && <span className="font-mono text-2xs text-faint">{codigo}</span>}
    </span>
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
