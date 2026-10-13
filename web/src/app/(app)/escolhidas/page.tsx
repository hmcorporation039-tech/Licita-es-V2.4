'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calculator, X } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { ParticipationPlanListItem } from '@/lib/types'
import { Button, Carregando, EmptyState, ErrorState, LinkButton, PageHeader, StatusTag, Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui'

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
    <>
      <PageHeader
        title="Licitações escolhidas"
        description={
          <p className="max-w-3xl">
            Licitações que você marcou como interessado — encontre-as em “Meus matches” e clique em “Marcar como interessado” pra elas aparecerem
            aqui. Em cada uma, o estudo de custos calcula preços de mercado, deslocamento, prazo, lucro ou prejuízo e gera o PDF.
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
        <Carregando linhas={4} texto="Carregando licitações escolhidas…" />
      ) : plans.length === 0 ? (
        !error && (
          <EmptyState
            title="Nenhuma licitação escolhida ainda"
            description="Em “Meus matches”, use “Marcar como interessado” nas licitações em que você pretende concorrer."
            action={
              <LinkButton href="/matches" size="sm">
                Ir para Meus matches
              </LinkButton>
            }
          />
        )
      ) : (
        <TableWrap minWidth={820}>
          <Table>
            <THead>
              <tr>
                <Th>Objeto</Th>
                <Th>Fonte</Th>
                <Th>UF</Th>
                <Th align="right">Valor estimado</Th>
                <Th align="right">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {plans.map((p) => (
                <Tr key={p.id} interactive>
                  <Td className="max-w-[420px]">
                    <Link href={`/tenders/${p.tenderId}`} className="line-clamp-2 font-medium text-ink hover:text-accent hover:underline">
                      {p.tender.objetoResumido ?? p.tender.objeto}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">{p.tender.orgao ?? 'órgão n/d'}</p>
                  </Td>
                  <Td>
                    <StatusTag mono>{p.tender.fonte}</StatusTag>
                  </Td>
                  <Td className="font-mono">{p.tender.uf ?? 'n/d'}</Td>
                  <Td numeric>{formatValor(p.tender.valorEstimado)}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/escolhidas/${p.tenderId}`} size="sm" icon={Calculator}>
                        Estudo de custos
                      </LinkButton>
                      <Button size="sm" variant="ghost" icon={X} onClick={() => remover(p.tenderId)}>
                        Remover da lista
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  )
}
