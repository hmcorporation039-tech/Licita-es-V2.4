'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Star, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Paginated, TenderMatch } from '@/lib/types'
import NotaDeAderencia from '@/components/NotaDeAderencia'
import { Button, Carregando, Checkbox, EmptyState, ErrorState, Field, LinkButton, PageHeader, Select, StatusTag, cx, useDialogo } from '@/components/ui'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MatchesPage() {
  const user = useRequireSession()
  const [data, setData] = useState<Paginated<TenderMatch> | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [ordem, setOrdem] = useState<'recentes' | 'nota'>('nota')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [interesseMsg, setInteresseMsg] = useState<Record<string, string>>({})
  const [clearing, setClearing] = useState(false)
  const { confirmar, dialogo } = useDialogo()

  function load() {
    if (!user) return
    setLoading(true)
    setErro(false)
    const qs = new URLSearchParams({ page: '1', pageSize: '30' })
    if (unreadOnly) qs.set('unreadOnly', 'true')
    if (ordem === 'nota') qs.set('ordem', 'nota')
    api
      .get<Paginated<TenderMatch>>(`/api/matches?${qs.toString()}`)
      .then(setData)
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [user, unreadOnly, ordem])

  async function markAsRead(matchId: string) {
    if (!user) return
    await api.patch(`/api/matches/${matchId}`, { read: true })
    load()
  }

  async function marcarInteresse(matchId: string, tenderId: string) {
    if (!user) return
    setInteresseMsg((m) => ({ ...m, [matchId]: 'Salvando…' }))
    try {
      await api.patch(`/api/tenders/${tenderId}/plano/status`, { status: 'VOU_PARTICIPAR' })
      setInteresseMsg((m) => ({ ...m, [matchId]: 'Marcada em "Licitações escolhidas"' }))
    } catch (err) {
      setInteresseMsg((m) => ({ ...m, [matchId]: err instanceof ApiRequestError ? err.message : 'Erro' }))
    }
  }

  async function clearAllMatches() {
    if (!user) return
    const ok = await confirmar({
      titulo: 'Apagar todos os matches encontrados?',
      mensagem: 'Essa ação não pode ser desfeita.',
      confirmarRotulo: 'Apagar todos',
      perigo: true,
    })
    if (!ok) return
    setClearing(true)
    try {
      await api.delete('/api/matches')
      load()
    } finally {
      setClearing(false)
    }
  }

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Meus matches"
        description={data ? `${data.total.toLocaleString('pt-BR')} ${data.total === 1 ? 'match encontrado' : 'matches encontrados'}` : 'Licitações que combinam com os seus itens monitorados'}
        actions={
          data &&
          data.total > 0 && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={clearAllMatches} loading={clearing}>
              {clearing ? 'Apagando…' : 'Apagar todos os matches'}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <Field label="Ordenar por" className="w-full sm:w-64">
            <Select value={ordem} onChange={(e) => setOrdem(e.target.value as 'recentes' | 'nota')}>
              <option value="nota">Maior nota de aderência</option>
              <option value="recentes">Mais recentes</option>
            </Select>
          </Field>
          <Checkbox label="Só não lidos" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="pb-2.5" />
        </div>

        {erro ? (
          <ErrorState message="Não foi possível carregar os matches." onRetry={load} />
        ) : loading ? (
          <Carregando linhas={5} texto="Carregando matches…" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={unreadOnly ? 'Nenhum match não lido' : 'Nenhum match ainda'}
            description='Cadastre itens monitorados e clique em "Buscar agora" para varrer o que já foi coletado.'
            action={
              <LinkButton href="/items" size="sm">
                Ir para itens monitorados
              </LinkButton>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft rounded border border-line bg-surface">
            {data.items.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    {!m.read && (
                      <>
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="sr-only">Não lido.</span>
                      </>
                    )}
                    <span className="truncate">Item: {m.monitoredItem.name}</span>
                  </p>
                  <Link href={`/tenders/${m.tenderId}`} className={cx('text-sm text-ink hover:text-accent hover:underline', m.read ? 'font-medium' : 'font-semibold')}>
                    {m.tender.objetoResumido ?? m.tender.objeto}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <StatusTag mono>{m.tender.fonte}</StatusTag>
                    <span className="font-mono">{m.tender.uf ?? 'UF n/d'}</span>
                    <span aria-hidden>·</span>
                    <span className="font-mono">{formatValor(m.tender.valorEstimado)}</span>
                  </p>
                  <NotaDeAderencia aderencia={m.aderencia} />
                  {m.matchedKeywords.length > 0 && <p className="text-xs text-faint">Palavras: {m.matchedKeywords.join(', ')}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={Star} onClick={() => marcarInteresse(m.id, m.tenderId)}>
                      Marcar como interessado
                    </Button>
                    {!m.read && (
                      <Button size="sm" variant="ghost" icon={Check} onClick={() => markAsRead(m.id)}>
                        Marcar como lido
                      </Button>
                    )}
                  </div>
                  {interesseMsg[m.id] && (
                    <p role="status" className="text-xs text-muted">
                      {interesseMsg[m.id]}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialogo}
    </>
  )
}
