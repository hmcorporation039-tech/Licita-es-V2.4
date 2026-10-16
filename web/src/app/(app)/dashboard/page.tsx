'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BellDot, CalendarClock, FileWarning, Inbox, ListChecks } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api } from '@/lib/api'
import { DashboardData } from '@/lib/types'
import BrazilMap, { EstadoMapa } from '@/components/BrazilMap'
import MedidorDeAnalises from '@/components/MedidorDeAnalises'
import { Carregando, EmptyState, ErrorState, Metric, MetricRow, PageHeader, Panel, Prazo, TextLink } from '@/components/ui'

const numero = (n: number) => n.toLocaleString('pt-BR')

export default function DashboardPage() {
  const user = useRequireSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [estadosMapa, setEstadosMapa] = useState<EstadoMapa[]>([])

  const carregarResumo = useCallback(() => {
    setLoading(true)
    setErro(false)
    api
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    carregarResumo()
    api
      .get<{ estados: EstadoMapa[] }>('/api/dashboard/mapa')
      .then((r) => setEstadosMapa(r.estados))
      .catch(() => setEstadosMapa([]))
  }, [user, carregarResumo])

  if (!user) return null

  return (
    <>
      <PageHeader title="Painel" description={`Olá, ${user.name ?? user.email}. Este é o resumo da sua conta.`} />

      {erro ? (
        <ErrorState message="Não foi possível carregar o resumo do painel." onRetry={carregarResumo} />
      ) : loading || !data ? (
        <Carregando linhas={4} texto="Carregando o painel…" />
      ) : (
        <>
          <MetricRow>
            <Metric label="Itens monitorados ativos" value={numero(data.itensMonitoradosAtivos)} href="/items" icon={ListChecks} color="accent" />
            <Metric label="Matches não lidos" value={numero(data.matchesNaoLidos)} href="/matches" icon={BellDot} color="violeta" />
            <Metric label="Matches no total" value={numero(data.matchesTotal)} href="/matches" icon={Inbox} color="ceu" className="col-span-2 sm:col-span-1" />
          </MetricRow>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <Panel title="Licitações escolhidas pelo Brasil">
                <BrazilMap estados={estadosMapa} />
              </Panel>

              <Panel title="Últimos matches" actions={<TextLink href="/matches" className="text-sm">Ver todos</TextLink>} padding={data.ultimosMatches.length === 0 ? 'md' : 'none'}>
                {data.ultimosMatches.length === 0 ? (
                  <EmptyState icon={Inbox} title="Nenhum match ainda" description="Os matches aparecem aqui quando uma licitação coletada combina com os seus itens monitorados." />
                ) : (
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {data.ultimosMatches.map((m) => (
                      <li key={m.id} className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5">
                        <p className="truncate text-xs text-muted">Item: {m.monitoredItem.name}</p>
                        <Link href={`/tenders/${m.tenderId}`} className="line-clamp-2 text-sm text-ink hover:text-accent hover:underline">
                          {m.tender.objetoResumido ?? m.tender.objeto}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <Panel title="Próximos prazos" description="Próximos 14 dias" padding={data.proximosPrazos.length === 0 ? 'md' : 'none'}>
                {data.proximosPrazos.length === 0 ? (
                  <EmptyState icon={CalendarClock} title="Nenhum prazo próximo" description="Nenhum prazo nos próximos 14 dias entre as licitações que você está avaliando ou vai participar." />
                ) : (
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {data.proximosPrazos.map((p, i) => (
                      <li key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-medium text-ink">{p.label}</p>
                          <Link href={`/tenders/${p.tenderId}`} className="line-clamp-2 text-xs text-muted hover:text-accent hover:underline">
                            {p.tenderObjeto}
                          </Link>
                        </div>
                        <Prazo data={p.date} semHora className="shrink-0 items-end text-right" />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Documentos vencendo em breve"
                description="Próximos 15 dias"
                actions={<TextLink href="/empresa" className="text-sm">Ver cofre de documentos</TextLink>}
                padding={data.documentosVencendoEmBreve.length === 0 ? 'md' : 'none'}
              >
                {data.documentosVencendoEmBreve.length === 0 ? (
                  <EmptyState icon={FileWarning} title="Nenhum documento vencendo" description="Nenhum documento do cofre vencendo nos próximos 15 dias." />
                ) : (
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {data.documentosVencendoEmBreve.map((d) => (
                      <li key={d.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <span className="min-w-0 break-words text-sm font-medium text-ink">{d.nome}</span>
                        <Prazo data={d.dataValidade} semHora className="shrink-0 items-end text-right" />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <MedidorDeAnalises />
            </div>
          </div>
        </>
      )}
    </>
  )
}
