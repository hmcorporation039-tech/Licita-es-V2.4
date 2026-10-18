'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Filter, Star, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Paginated, TenderMatch } from '@/lib/types'
import NotaDeAderencia from '@/components/NotaDeAderencia'
import { Button, Carregando, Checkbox, EmptyState, ErrorState, Field, LinkButton, PageHeader, Prazo, Select, StatusTag, cx, useDialogo } from '@/components/ui'
import SeloObraCompleta from '@/components/SeloObraCompleta'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'
import { fimDasPropostas, localDaLicitacao } from '@/lib/licitacaoNaTela'

type MatchComEscolha = TenderMatch & { escolhida?: boolean }

type MatchesDaPagina = Paginated<MatchComEscolha> & { ordenacaoPorNotaLimitadaA?: number | null }

const TAMANHO_DA_PAGINA = 30

const SALVANDO = 'salvando'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function rotuloDaFonte(fonte: string) {
  return ROTULOS_DE_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
}

export default function MatchesPage() {
  const user = useRequireSession()
  const [data, setData] = useState<MatchesDaPagina | null>(null)
  const [page, setPage] = useState(1)
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
    const qs = new URLSearchParams({ page: String(page), pageSize: String(TAMANHO_DA_PAGINA) })
    if (unreadOnly) qs.set('unreadOnly', 'true')
    if (ordem === 'nota') qs.set('ordem', 'nota')
    api
      .get<MatchesDaPagina>(`/api/matches?${qs.toString()}`)
      .then(setData)
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [user, unreadOnly, ordem, page])

  async function markAsRead(matchId: string) {
    if (!user) return
    await api.patch(`/api/matches/${matchId}`, { read: true })
    load()
  }

  async function marcarInteresse(matchId: string, tenderId: string) {
    if (!user) return
    setInteresseMsg((m) => ({ ...m, [matchId]: SALVANDO }))
    try {
      await api.patch(`/api/tenders/${tenderId}/plano/status`, { status: 'VOU_PARTICIPAR' })
      setData((d) => d && { ...d, items: d.items.map((item) => (item.tenderId === tenderId ? { ...item, escolhida: true } : item)) })
      setInteresseMsg((m) => {
        const resto = { ...m }
        delete resto[matchId]
        return resto
      })
    } catch (err) {
      setInteresseMsg((m) => ({ ...m, [matchId]: err instanceof ApiRequestError ? err.message : 'Não foi possível marcar. Tente de novo.' }))
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
      if (page === 1) load()
      else setPage(1)
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
            <Select
              value={ordem}
              onChange={(e) => {
                setPage(1)
                setOrdem(e.target.value as 'recentes' | 'nota')
              }}
            >
              <option value="nota">Maior nota de aderência</option>
              <option value="recentes">Mais recentes</option>
            </Select>
          </Field>
          <Checkbox
            label="Só não lidos"
            checked={unreadOnly}
            onChange={(e) => {
              setPage(1)
              setUnreadOnly(e.target.checked)
            }}
            className="pb-2.5"
          />
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Filter size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            Filtro sempre ativo: só aparecem licitações abertas, já publicadas e com propostas encerrando dentro da janela de prazo da coleta (ou
            sem data de encerramento). Revogadas, suspensas, anuladas, canceladas e as já encerradas ficam de fora
            {unreadOnly && <>, assim como os matches que você já marcou como lidos</>}. Por isso este número pode ser menor que o anunciado em
            &quot;Buscar agora&quot;.
          </span>
        </p>

        {!erro && !loading && ordem === 'nota' && data?.ordenacaoPorNotaLimitadaA ? (
          <p role="status" className="rounded border border-line bg-sunken px-3 py-2 text-xs text-muted">
            Ordenando por nota as {data.ordenacaoPorNotaLimitadaA.toLocaleString('pt-BR')} de prazo mais próximo, das{' '}
            {data.total.toLocaleString('pt-BR')} encontradas. Para percorrer todas, ordene por &quot;Mais recentes&quot;.
          </p>
        ) : null}

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
                  <p className="truncate text-xs text-muted" title={m.tender.orgao ?? undefined}>
                    {m.tender.orgao ?? 'Órgão n/d'} · {localDaLicitacao(m.tender)}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <StatusTag mono>{rotuloDaFonte(m.tender.fonte)}</StatusTag>
                    <span className="font-mono">{formatValor(m.tender.valorEstimado)}</span>
                  </p>
                  {m.dentroDeObraCompleta && (
                    <span className="self-start">
                      <SeloObraCompleta />
                    </span>
                  )}
                  <NotaDeAderencia aderencia={m.aderencia} />
                  {m.matchedKeywords.length > 0 && <p className="text-xs text-faint">Palavras: {m.matchedKeywords.join(', ')}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
                  <span className="text-2xs font-medium text-muted">Prazo das propostas</span>
                  <Prazo data={fimDasPropostas(m.tender)} className="md:items-end md:text-right" />
                  <div className="flex flex-wrap items-center gap-2">
                    {m.escolhida ? (
                      <>
                        <StatusTag tone="accent">Escolhida</StatusTag>
                        <LinkButton href="/escolhidas" size="sm" variant="ghost" iconRight={ArrowRight}>
                          Ver em Escolhidas
                        </LinkButton>
                      </>
                    ) : (
                      <Button size="sm" icon={Star} loading={interesseMsg[m.id] === SALVANDO} onClick={() => marcarInteresse(m.id, m.tenderId)}>
                        Marcar como interessado
                      </Button>
                    )}
                    {!m.read && (
                      <Button size="sm" variant="ghost" icon={Check} onClick={() => markAsRead(m.id)}>
                        Marcar como lido
                      </Button>
                    )}
                  </div>
                  {interesseMsg[m.id] && interesseMsg[m.id] !== SALVANDO && (
                    <p role="alert" className="text-xs text-danger">
                      {interesseMsg[m.id]}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!erro && !loading && data && data.totalPages > 1 && (
          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>
              Página <span className="font-mono text-ink">{data.page}</span> de <span className="font-mono">{data.totalPages}</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button size="sm" iconRight={ChevronRight} disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </nav>
        )}
      </div>

      {dialogo}
    </>
  )
}
