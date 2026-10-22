'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import type { PlanoComercial } from '@/lib/adminTypes'
import type { SessionUser } from '@/lib/session'
import { esquecerAvisoDeRecuperacao, lerAvisoDeRecuperacao, type SituacaoDoSegundoFator } from '@/lib/segundoFator'
import { Notice, PageHeader, StatusTag, TabLinks, cx } from '@/components/ui'
import LoginEmDuasEtapas from './LoginEmDuasEtapas'
import ConfirmacaoDoSegundoFator from './ConfirmacaoDoSegundoFator'

const ABAS = [
  { href: '/admin', label: 'Visão geral', exato: true },
  { href: '/admin/empresas', label: 'Empresas' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/auditoria', label: 'Auditoria' },
  { href: '/admin/uso-ia', label: 'Consumo de IA' },
  { href: '/admin/planos', label: 'Planos' },
  { href: '/admin/chamados', label: 'Chamados' },
  { href: '/admin/cobranca', label: 'Cobrança' },
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

type Liberacao = 'carregando' | 'liberado' | 'pendente'

function useLiberacaoDoAdmin(ativo: boolean): Liberacao {
  const [liberacao, setLiberacao] = useState<Liberacao>('carregando')
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    api
      .get<SituacaoDoSegundoFator>('/api/segundo-fator')
      .then((s) => {
        if (vivo) setLiberacao(s.ativo ? 'liberado' : 'pendente')
      })
      .catch((err) => {
        if (vivo) setLiberacao(err instanceof ApiRequestError && err.status === 404 ? 'liberado' : 'pendente')
      })
    return () => {
      vivo = false
    }
  }, [ativo])
  return liberacao
}

export default function AdminShell({ titulo, children }: { titulo: string; children: (user: SessionUser) => ReactNode }) {
  const user = useRequireSession()
  const router = useRouter()
  const liberacao = useLiberacaoDoAdmin(Boolean(user?.isAdmin))
  const [codigosRestantes, setCodigosRestantes] = useState<number | null>(null)

  useEffect(() => {
    setCodigosRestantes(lerAvisoDeRecuperacao())
  }, [])

  useEffect(() => {
    if (user && !user.isAdmin) router.replace('/dashboard')
  }, [user, router])

  if (!user || !user.isAdmin || liberacao === 'carregando') return null

  return (
    <>
      <AdminCabecalho titulo={titulo} />
      {codigosRestantes !== null && (
        <Notice
          tone="warn"
          title="Você entrou com um código de recuperação"
          action={
            <button
              type="button"
              className="text-sm font-medium text-accent underline underline-offset-[3px]"
              onClick={() => {
                esquecerAvisoDeRecuperacao()
                setCodigosRestantes(null)
              }}
            >
              Entendi
            </button>
          }
        >
          Restam {codigosRestantes} códigos. Se perdeu o celular, cadastre o aplicativo de novo em Minha conta, em &quot;Trocar de celular&quot;.
        </Notice>
      )}
      {liberacao === 'pendente' ? (
        <div className="w-full max-w-xl">
          <LoginEmDuasEtapas obrigatorio onAtivado={() => window.location.reload()} />
        </div>
      ) : (
        children(user)
      )}
      <ConfirmacaoDoSegundoFator />
    </>
  )
}
