'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api } from '@/lib/api'
import { DashboardData } from '@/lib/types'
import BrazilMap, { EstadoMapa } from '@/components/BrazilMap'

function formatData(v: string) {
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded border border-slate-200 bg-white p-4 hover:border-indigo-300">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </Link>
  )
}

export default function DashboardPage() {
  const user = useRequireSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [estadosMapa, setEstadosMapa] = useState<EstadoMapa[]>([])

  useEffect(() => {
    if (!user) return
    api
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .finally(() => setLoading(false))
    api
      .get<{ estados: EstadoMapa[] }>('/api/dashboard/mapa')
      .then((r) => setEstadosMapa(r.estados))
      .catch(() => setEstadosMapa([]))
  }, [user])

  if (!user) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Olá, {user.name ?? user.email}</h1>
        <p className="text-sm text-slate-500">Resumo da sua conta</p>
      </div>

      {loading || !data ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Itens monitorados ativos" value={data.itensMonitoradosAtivos} href="/items" />
            <StatCard label="Matches não lidos" value={data.matchesNaoLidos} href="/matches" />
            <StatCard label="Matches no total" value={data.matchesTotal} href="/matches" />
          </div>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Licitações escolhidas pelo Brasil</h2>
            <BrazilMap estados={estadosMapa} />
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Próximos prazos</h2>
            {data.proximosPrazos.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum prazo nos próximos 14 dias entre as licitações que você está avaliando ou vai participar.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.proximosPrazos.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded border border-slate-100 p-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{p.label}</p>
                      <Link href={`/tenders/${p.tenderId}`} className="text-slate-500 hover:text-indigo-700 hover:underline">
                        {p.tenderObjeto}
                      </Link>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatData(p.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Documentos vencendo em breve</h2>
            {data.documentosVencendoEmBreve.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum documento do cofre vencendo nos próximos 15 dias.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.documentosVencendoEmBreve.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded border border-slate-100 p-2 text-sm">
                    <span className="font-medium text-slate-800">{d.nome}</span>
                    <span className="shrink-0 text-xs text-slate-500">{formatData(d.dataValidade)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/documentos" className="mt-3 inline-block text-sm text-indigo-700 hover:underline">
              Ver cofre de documentos
            </Link>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Últimos matches</h2>
            {data.ultimosMatches.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum match ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.ultimosMatches.map((m) => (
                  <li key={m.id} className="rounded border border-slate-100 p-2 text-sm">
                    <p className="text-xs text-slate-500">Item: {m.monitoredItem.name}</p>
                    <Link href={`/tenders/${m.tenderId}`} className="text-indigo-700 hover:underline">
                      {m.tender.objetoResumido ?? m.tender.objeto}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/matches" className="mt-3 inline-block text-sm text-indigo-700 hover:underline">
              Ver todos os matches
            </Link>
          </section>
        </>
      )}
    </div>
  )
}
