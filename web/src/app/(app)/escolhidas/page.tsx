'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calculator, X } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { ParticipationPlanListItem } from '@/lib/types'
import { Button, Carregando, EmptyState, ErrorState, LinkButton, PageHeader, Prazo, StatusTag, Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui'
import { ROTULOS_DE_FONTE } from '@/lib/fontes'
import { fimDasPropostas, localDaLicitacao } from '@/lib/licitacaoNaTela'
import AvisoDeVersaoDoPncp from '@/components/AvisoDeVersaoDoPncp'
import ExportarParaExcel from '@/components/ExportarParaExcel'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function rotuloDaFonte(fonte: string) {
  return ROTULOS_DE_FONTE[fonte] ?? fonte.replace(/_/g, ' ')
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
        actions={
          !loading && (
            <ExportarParaExcel planilha="escolhidas" title="Baixa todas as licitações com plano de participação: escolhidas, em avaliação, já disputadas e descartadas" />
          )
        }
        description={
          <p className="max-w-3xl">
            Licitações em que você decidiu concorrer. Para incluir uma, use “Escolher esta licitação” no detalhe da licitação ou “Marcar como interessado” em “Meus matches”.
            Em cada uma, o estudo de custos calcula preços de mercado, deslocamento, prazo, lucro ou prejuízo e gera o PDF. A planilha do Excel traz
            também as licitações em avaliação, as já disputadas e as descartadas, com a situação de cada uma.
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
            description="Abra uma licitação e use “Escolher esta licitação”, ou use “Marcar como interessado” em “Meus matches”."
            action={
              <LinkButton href="/matches" size="sm">
                Ir para Meus matches
              </LinkButton>
            }
          />
        )
      ) : (
        <>
          <ul aria-label="Licitações escolhidas" className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[1360px]:hidden">
            {plans.map((p) => (
              <li key={p.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-cartao">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Prazo data={fimDasPropostas(p.tender)} />
                  <StatusTag mono>{rotuloDaFonte(p.tender.fonte)}</StatusTag>
                </div>
                <div className="min-w-0">
                  <Link href={`/tenders/${p.tenderId}`} className="line-clamp-3 font-medium break-words text-ink hover:text-accent hover:underline">
                    {p.tender.objetoResumido ?? p.tender.objeto}
                  </Link>
                  <p className="mt-0.5 text-xs break-words text-muted">{p.tender.orgao ?? 'órgão n/d'}</p>
                </div>
                <AvisoDeVersaoDoPncp tender={p.tender} />
                <dl className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">Local</dt>
                    <dd className="break-words text-ink-2">{localDaLicitacao(p.tender)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">Valor estimado</dt>
                    <dd className="font-mono text-ink-2">{formatValor(p.tender.valorEstimado)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/escolhidas/${p.tenderId}`} size="sm" icon={Calculator} className="flex-1 justify-center">
                    Estudo de custos
                  </LinkButton>
                  <Button size="sm" variant="ghost" icon={X} onClick={() => remover(p.tenderId)}>
                    Remover da lista
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <TableWrap minWidth={940} className="hidden min-[1360px]:block">
            <Table>
              <THead>
                <tr>
                  <Th>Prazo</Th>
                  <Th>Objeto</Th>
                  <Th>Fonte</Th>
                  <Th>Local</Th>
                  <Th align="right">Valor estimado</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {plans.map((p) => (
                  <Tr key={p.id} interactive>
                    <Td className="whitespace-nowrap">
                      <Prazo data={fimDasPropostas(p.tender)} />
                    </Td>
                    <Td className="max-w-[380px]">
                      <Link href={`/tenders/${p.tenderId}`} className="line-clamp-2 font-medium text-ink hover:text-accent hover:underline">
                        {p.tender.objetoResumido ?? p.tender.objeto}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">{p.tender.orgao ?? 'órgão n/d'}</p>
                      <AvisoDeVersaoDoPncp tender={p.tender} className="mt-2" />
                    </Td>
                    <Td>
                      <StatusTag mono>{rotuloDaFonte(p.tender.fonte)}</StatusTag>
                    </Td>
                    <Td className="min-w-[8rem]">{localDaLicitacao(p.tender)}</Td>
                    <Td numeric>{formatValor(p.tender.valorEstimado)}</Td>
                    <Td>
                      <div className="flex flex-col items-end gap-1.5">
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
        </>
      )}
    </>
  )
}
