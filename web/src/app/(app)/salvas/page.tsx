'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { useFavoritas } from '@/hooks/useFavoritas'
import { api, ApiRequestError } from '@/lib/api'
import { FavoritaListItem } from '@/lib/types'
import { Carregando, EmptyState, ErrorState, LinkButton, PageHeader, Prazo, StatusTag } from '@/components/ui'
import BotaoFavorito from '@/components/BotaoFavorito'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'
import { fimDasPropostas, localDaLicitacao } from '@/lib/licitacaoNaTela'
import AvisoDeVersaoDoPncp from '@/components/AvisoDeVersaoDoPncp'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function rotuloDaFonte(fonte: string) {
  return ROTULOS_DE_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
}

export default function SalvasPage() {
  const user = useRequireSession()
  const { ehFavorita, alternar } = useFavoritas(!!user)
  const [salvas, setSalvas] = useState<FavoritaListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!user) return
    setLoading(true)
    api
      .get<FavoritaListItem[]>('/api/tenders/favoritas')
      .then(setSalvas)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [user])

  // Ao desfavoritar daqui, tira o card da lista na hora (sem recarregar tudo).
  function remover(tenderId: string) {
    alternar(tenderId)
    setSalvas((atual) => atual.filter((f) => f.tender.id !== tenderId))
  }

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Minhas salvas"
        description={
          <p className="max-w-3xl">
            Licitações que você salvou para ver depois, com a estrela. É um marcador rápido — diferente de “Escolhidas”, que são as que você decidiu disputar.
          </p>
        }
      />

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      )}

      {loading ? (
        <Carregando linhas={4} texto="Carregando suas licitações salvas…" />
      ) : salvas.length === 0 ? (
        !error && (
          <EmptyState
            title="Nenhuma licitação salva ainda"
            description="Abra uma licitação, ou passe pela lista, e toque na estrela para salvar aqui."
            action={
              <LinkButton href="/tenders" size="sm">
                Ver licitações
              </LinkButton>
            }
          />
        )
      ) : (
        <ul aria-label="Licitações salvas" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {salvas.map((f) => (
            <li key={f.tender.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-cartao">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Prazo data={fimDasPropostas(f.tender)} />
                <div className="flex items-center gap-2">
                  <StatusTag mono>{rotuloDaFonte(f.tender.fonte)}</StatusTag>
                  <BotaoFavorito favorita={ehFavorita(f.tender.id)} onToggle={() => remover(f.tender.id)} />
                </div>
              </div>
              <div className="min-w-0">
                <Link href={`/tenders/${f.tender.id}`} className="line-clamp-3 font-medium break-words text-ink hover:text-accent hover:underline">
                  {f.tender.objetoResumido ?? f.tender.objeto}
                </Link>
                <p className="mt-0.5 text-xs break-words text-muted">{f.tender.orgao ?? 'órgão n/d'}</p>
              </div>
              <AvisoDeVersaoDoPncp tender={f.tender} />
              <dl className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Local</dt>
                  <dd className="break-words text-ink-2">{localDaLicitacao(f.tender)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Valor estimado</dt>
                  <dd className="font-mono text-ink-2">{formatValor(f.tender.valorEstimado)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
