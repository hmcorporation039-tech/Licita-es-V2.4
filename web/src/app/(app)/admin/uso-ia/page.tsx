'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { UsoIaResposta } from '@/lib/adminTypes'
import { Carregando, ErrorState, Metric, MetricRow, StatusTag, Table, TableWrap, Td, THead, Th, Tr } from '@/components/ui'

const nf = new Intl.NumberFormat('pt-BR')
const usd = (v: number) => (v ? `US$ ${v.toFixed(2)}` : '—')

export default function AdminUsoIaPage() {
  return <AdminShell titulo="Consumo de IA">{() => <Conteudo />}</AdminShell>
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
        {descricao && <p className="max-w-prose text-xs text-muted">{descricao}</p>}
      </div>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-sm text-muted">{children}</p>
}

function CabecalhoDeConsumo() {
  return (
    <>
      <Th align="right">Chamadas</Th>
      <Th align="right">Tokens in</Th>
      <Th align="right">Tokens out</Th>
      <Th align="right">Custo est.</Th>
    </>
  )
}

function CelulasDeConsumo({ chamadas, tokensEntrada, tokensSaida, custoEstimadoUsd }: { chamadas: number; tokensEntrada: number; tokensSaida: number; custoEstimadoUsd: number }) {
  return (
    <>
      <Td numeric>{nf.format(chamadas)}</Td>
      <Td numeric>{nf.format(tokensEntrada)}</Td>
      <Td numeric>{nf.format(tokensSaida)}</Td>
      <Td numeric>{usd(custoEstimadoUsd)}</Td>
    </>
  )
}

function Conteudo() {
  const [d, setD] = useState<UsoIaResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api
      .get<UsoIaResposta>('/api/admin/ai-usage')
      .then(setD)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro)
    return (
      <ErrorState
        message={erro}
        onRetry={() => {
          setErro(null)
          carregar()
        }}
      />
    )
  if (!d) return <Carregando linhas={6} />

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Mês corrente"
        descricao={
          <>
            Desde <span className="font-mono">{new Date(d.periodo.de).toLocaleDateString('pt-BR')}</span>.
          </>
        }
      >
        <MetricRow>
          <Metric label="Chamadas" value={nf.format(d.total.chamadas)} />
          <Metric label="Tokens de entrada" value={nf.format(d.total.tokensEntrada)} />
          <Metric label="Tokens de saída" value={nf.format(d.total.tokensSaida)} />
          <Metric label="Custo estimado" value={usd(d.total.custoEstimadoUsd)} />
        </MetricRow>
      </Secao>

      <Secao titulo="Por empresa" descricao="Quem pediu a análise.">
        {d.porEmpresa.length === 0 ? (
          <Vazio>Nenhuma chamada de IA neste período.</Vazio>
        ) : (
          <TableWrap minWidth={720}>
            <Table>
              <THead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>Plano</Th>
                  <CabecalhoDeConsumo />
                </tr>
              </THead>
              <tbody>
                {d.porEmpresa.map((e) => (
                  <Tr key={e.companyId ?? 'sem'}>
                    <Td>{e.empresa}</Td>
                    <Td>{e.planCode ? <StatusTag mono>{e.planCode}</StatusTag> : <span className="text-faint">—</span>}</Td>
                    <CelulasDeConsumo {...e} />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao
        titulo="Por etapa e modelo"
        descricao="Cada análise tem duas etapas: o analista lê o edital e o revisor o confere. A revisão é custo da plataforma: não conta na cota do cliente."
      >
        {d.porEtapa.length === 0 ? (
          <Vazio>Nenhuma chamada neste período.</Vazio>
        ) : (
          <TableWrap minWidth={720}>
            <Table>
              <THead>
                <tr>
                  <Th>Etapa</Th>
                  <Th>Modelo</Th>
                  <CabecalhoDeConsumo />
                </tr>
              </THead>
              <tbody>
                {d.porEtapa.map((e) => (
                  <Tr key={`${e.etapa}-${e.provider}-${e.model}`}>
                    <Td>{e.etapa === 'revisao' ? 'Revisão' : 'Análise'}</Td>
                    <Td className="font-mono text-xs text-ink-2">
                      {e.provider} / {e.model}
                    </Td>
                    <CelulasDeConsumo {...e} />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao titulo="Por mês">
        {d.porMes.length === 0 ? (
          <Vazio>Nenhum mês com consumo registrado.</Vazio>
        ) : (
          <TableWrap minWidth={560}>
            <Table>
              <THead>
                <tr>
                  <Th>Mês</Th>
                  <CabecalhoDeConsumo />
                </tr>
              </THead>
              <tbody>
                {d.porMes.map((m) => (
                  <Tr key={m.mes}>
                    <Td className="font-mono">{m.mes}</Td>
                    <CelulasDeConsumo {...m} />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <Secao titulo="Últimas chamadas">
        {d.recentes.length === 0 ? (
          <Vazio>Nenhuma chamada recente.</Vazio>
        ) : (
          <TableWrap minWidth={720}>
            <Table>
              <THead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Modelo</Th>
                  <Th align="right">Tokens in</Th>
                  <Th align="right">Tokens out</Th>
                  <Th align="right">Status</Th>
                </tr>
              </THead>
              <tbody>
                {d.recentes.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap font-mono text-xs text-muted">{new Date(r.createdAt).toLocaleString('pt-BR')}</Td>
                    <Td className="font-mono text-xs text-ink-2">
                      {r.provider}/{r.model}
                    </Td>
                    <Td numeric>{nf.format(r.inputTokens)}</Td>
                    <Td numeric>{nf.format(r.outputTokens)}</Td>
                    <Td className="text-right">
                      <StatusTag mono tone={r.status === 'OK' ? 'neutral' : 'danger'}>
                        {r.status}
                      </StatusTag>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Secao>

      <p className="max-w-prose text-xs text-muted">{d.aviso}</p>
    </div>
  )
}
