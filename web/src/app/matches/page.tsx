'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Paginated, TenderMatch } from '@/lib/types'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MatchesPage() {
  const user = useRequireSession()
  const [data, setData] = useState<Paginated<TenderMatch> | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [interesseMsg, setInteresseMsg] = useState<Record<string, string>>({})
  const [clearing, setClearing] = useState(false)

  function load() {
    if (!user) return
    setLoading(true)
    const qs = new URLSearchParams({ page: '1', pageSize: '30' })
    if (unreadOnly) qs.set('unreadOnly', 'true')
    api
      .get<Paginated<TenderMatch>>(`/api/matches?${qs.toString()}`)
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(load, [user, unreadOnly])

  async function markAsRead(matchId: string) {
    if (!user) return
    await api.patch(`/api/matches/${matchId}`, { read: true })
    load()
  }

  async function marcarInteresse(matchId: string, tenderId: string) {
    if (!user) return
    setInteresseMsg((m) => ({ ...m, [matchId]: 'Salvando...' }))
    try {
      await api.patch(`/api/tenders/${tenderId}/plano/status`, { status: 'VOU_PARTICIPAR' })
      setInteresseMsg((m) => ({ ...m, [matchId]: '✓ Marcada em "Licitações escolhidas"' }))
    } catch (err) {
      setInteresseMsg((m) => ({ ...m, [matchId]: err instanceof ApiRequestError ? err.message : 'Erro' }))
    }
  }

  async function clearAllMatches() {
    if (!user) return
    if (!confirm('Apagar todos os matches encontrados? Essa ação não pode ser desfeita.')) return
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meus matches</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Só não lidos
          </label>
          {data && data.total > 0 && (
            <button
              type="button"
              onClick={clearAllMatches}
              disabled={clearing}
              className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {clearing ? 'Apagando...' : 'Apagar todos os matches'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : data?.items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum match ainda. Cadastre itens monitorados e clique em &quot;Buscar agora&quot; para varrer o
          que já foi coletado.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.items.map((m) => (
            <li key={m.id} className={`rounded border p-4 ${m.read ? 'border-slate-200 bg-white' : 'border-indigo-300 bg-indigo-50'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">Item: {m.monitoredItem.name}</p>
                  <Link href={`/tenders/${m.tenderId}`} className="font-medium text-indigo-700 hover:underline">
                    {m.tender.objetoResumido ?? m.tender.objeto}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">
                    {m.tender.fonte} · {m.tender.uf ?? 'UF n/d'} · {formatValor(m.tender.valorEstimado)} · score{' '}
                    {(m.score * 100).toFixed(0)}%
                  </p>
                  {m.matchedKeywords.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">Palavras: {m.matchedKeywords.join(', ')}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <div className="flex gap-3">
                    <button onClick={() => marcarInteresse(m.id, m.tenderId)} className="text-emerald-700 hover:underline">
                      ★ Marcar como interessado
                    </button>
                    {!m.read && (
                      <button onClick={() => markAsRead(m.id)} className="text-indigo-700 hover:underline">
                        Marcar como lido
                      </button>
                    )}
                  </div>
                  {interesseMsg[m.id] && <p className="text-xs text-slate-500">{interesseMsg[m.id]}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
