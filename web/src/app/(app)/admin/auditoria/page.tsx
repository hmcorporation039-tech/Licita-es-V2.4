'use client'

import { useSearchParams } from 'next/navigation'
import { Fragment, Suspense, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { getSessionToken } from '@/lib/session'
import { formatarData } from '@/lib/datas'
import { ROTULO_ACAO } from '@/lib/adminTypes'
import type { EventoAuditoria } from '@/lib/adminTypes'
import { Button, Carregando, EmptyState, ErrorState, Field, Input, Notice, Select, StatusTag, Table, TableWrap, Td, THead, Th, Tr } from '@/components/ui'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

const ACOES_DE_RISCO = new Set(['LOGIN_FALHA', 'COTA_EXCEDIDA'])

export default function AdminAuditoriaPage() {
  return (
    <AdminShell titulo="Trilha de auditoria">
      {() => (
        <Suspense fallback={<Carregando linhas={6} />}>
          <Conteudo />
        </Suspense>
      )}
    </AdminShell>
  )
}

function Conteudo() {
  const inicial = useSearchParams()
  const [acao, setAcao] = useState('')
  const [ator, setAtor] = useState('')
  const [empresa, setEmpresa] = useState(inicial.get('companyId') ?? '')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [eventos, setEventos] = useState<EventoAuditoria[]>([])
  const [proximo, setProximo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [iniciou, setIniciou] = useState(false)

  const filtroQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (acao) p.set('action', acao)
    if (ator.trim()) p.set('actor', ator.trim())
    if (empresa.trim()) p.set('companyId', empresa.trim())
    if (de) p.set('from', new Date(de + 'T00:00:00').toISOString())
    if (ate) p.set('to', new Date(ate + 'T23:59:59').toISOString())
    return p
  }, [acao, ator, empresa, de, ate])

  const carregar = useCallback(
    async (depoisDe?: string) => {
      setCarregando(true)
      try {
        const p = filtroQuery()
        p.set('limit', '50')
        if (depoisDe) p.set('before', depoisDe)
        const r = await api.get<{ eventos: EventoAuditoria[]; proximo: string | null }>(`/api/admin/audit?${p}`)
        setEventos((atual) => (depoisDe ? [...atual, ...r.eventos] : r.eventos))
        setProximo(r.proximo)
        setErro(null)
      } catch (e) {
        setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
      } finally {
        setCarregando(false)
      }
    },
    [filtroQuery]
  )

  useEffect(() => {
    const t = setTimeout(() => {
      setIniciou(true)
      carregar()
    }, 300)
    return () => clearTimeout(t)
  }, [carregar])

  async function exportar() {
    try {
      const res = await fetch(`${API_URL}/api/admin/audit/export?${filtroQuery()}`, {
        headers: { Authorization: `Bearer ${getSessionToken() ?? ''}` },
      })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao exportar')
    }
  }

  const semEventos = eventos.length === 0

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        aria-label="Filtros da auditoria"
        onSubmit={(e) => e.preventDefault()}
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
      >
        <Field label="Ação">
          <Select value={acao} onChange={(e) => setAcao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quem (e-mail)">
          <Input type="search" value={ator} onChange={(e) => setAtor(e.target.value)} />
        </Field>
        <Field label="ID da empresa">
          <Input type="search" value={empresa} onChange={(e) => setEmpresa(e.target.value)} spellCheck={false} className="font-mono" />
        </Field>
        <Field label="De">
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Até">
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="font-mono" />
        </Field>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {semEventos ? (carregando || !iniciou ? 'Buscando eventos…' : 'Nenhum evento carregado') : (
            <>
              <span className="font-mono text-ink-2">{eventos.length}</span> evento(s) carregado(s){proximo ? ', há mais' : ''}
            </>
          )}
        </p>
        <Button size="sm" icon={Download} onClick={exportar}>
          Exportar CSV
        </Button>
      </div>

      {erro && semEventos && !carregando && <ErrorState message={erro} onRetry={() => carregar()} />}
      {erro && !semEventos && <Notice tone="danger">{erro}</Notice>}

      {semEventos && (carregando || !iniciou) && <Carregando linhas={6} />}

      {semEventos && iniciou && !carregando && !erro && (
        <EmptyState title="Nenhum evento com esses filtros." description="Amplie o período ou limpe algum filtro para ver mais eventos." />
      )}

      {!semEventos && (
        <TableWrap minWidth={940}>
          <Table>
            <THead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>O quê</Th>
                <Th>Entidade</Th>
                <Th>Detalhes</Th>
                <Th>IP</Th>
              </tr>
            </THead>
            <tbody>
              {eventos.map((ev) => {
                const expandido = aberto === ev.id
                const detalheId = `auditoria-detalhe-${ev.id}`
                const rotulo = ROTULO_ACAO[ev.action]
                return (
                  <Fragment key={ev.id}>
                    <Tr selected={expandido} className="align-top">
                      <Td className="whitespace-nowrap py-2 font-mono text-xs text-muted">{formatarData(ev.createdAt, { comHora: true })}</Td>
                      <Td className="py-2 text-xs">{ev.actorEmail ?? <span className="text-faint">—</span>}</Td>
                      <Td className="py-2">
                        <div className="flex flex-col items-start gap-1">
                          <span className={ACOES_DE_RISCO.has(ev.action) ? 'font-medium text-danger' : 'text-ink'}>{rotulo ?? ev.action}</span>
                          {rotulo && <StatusTag mono>{ev.action}</StatusTag>}
                        </div>
                      </Td>
                      <Td className="py-2">{ev.entityType ? <StatusTag mono>{ev.entityType}</StatusTag> : <span className="text-faint">—</span>}</Td>
                      <Td className="py-2">
                        {ev.metadata ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            iconRight={expandido ? ChevronUp : ChevronDown}
                            aria-expanded={expandido}
                            aria-controls={expandido ? detalheId : undefined}
                            onClick={() => setAberto(expandido ? null : ev.id)}
                            className="-ml-2.5"
                          >
                            {expandido ? 'Ocultar' : 'Ver'}
                          </Button>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </Td>
                      <Td className="py-2 font-mono text-xs text-muted">{ev.ip ?? '—'}</Td>
                    </Tr>
                    {expandido && (
                      <Tr selected>
                        <Td colSpan={6} className="pt-0">
                          <pre id={detalheId} className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-line-soft bg-surface p-3 font-mono text-xs text-ink-2">
                            {JSON.stringify(ev.metadata, null, 2)}
                          </pre>
                        </Td>
                      </Tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {proximo && (
        <Button onClick={() => carregar(proximo)} loading={carregando} className="self-start">
          {carregando ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  )
}
