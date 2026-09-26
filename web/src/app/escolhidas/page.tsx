'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { ParticipationPlanListItem } from '@/lib/types'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function EscolhidasPage() {
  const user = useRequireSession()
  const [plans, setPlans] = useState<ParticipationPlanListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!user) return
    setLoading(true)
    api
      .get<ParticipationPlanListItem[]>('/api/participation-plans?status=VOU_PARTICIPAR')
      .then(setPlans)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [user])

  async function remover(tenderId: string) {
    if (!user) return
    await api.patch(`/api/tenders/${tenderId}/plano/status`, { status: 'AVALIANDO' })
    load()
  }

  if (!user) return null

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Licitações escolhidas</h1>
      <p className="mb-4 text-sm text-slate-500">
        Licitações que você marcou como interessado — encontre-as em "Meus matches" e clique em "Marcar como
        interessado" pra elas aparecerem aqui.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma licitação escolhida ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((p) => (
            <li key={p.id} className="rounded border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link href={`/tenders/${p.tenderId}`} className="font-medium text-indigo-700 hover:underline">
                    {p.tender.objetoResumido ?? p.tender.objeto}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">
                    {p.tender.fonte} · {p.tender.orgao ?? 'órgão n/d'} · {p.tender.uf ?? 'UF n/d'} ·{' '}
                    {formatValor(p.tender.valorEstimado)}
                  </p>
                </div>
                <button onClick={() => remover(p.tenderId)} className="shrink-0 text-sm text-red-600 hover:underline">
                  Remover da lista
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
