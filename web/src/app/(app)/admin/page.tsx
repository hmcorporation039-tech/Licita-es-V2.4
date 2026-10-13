'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { Overview } from '@/lib/adminTypes'
import { Carregando, ErrorState, Metric, MetricRow } from '@/components/ui'

const nf = new Intl.NumberFormat('pt-BR')

export default function AdminVisaoGeralPage() {
  return <AdminShell titulo="Administração da plataforma">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api
      .get<Overview>('/api/admin/overview')
      .then(setOv)
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
  if (!ov) return <Carregando linhas={4} />

  const totalDeAnalises = Object.values(ov.analises).reduce((a, b) => a + b, 0)
  const analises = Object.entries(ov.analises)
    .map(([s, n]) => `${nf.format(n)} ${s}`)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="admin-base" className="flex flex-col gap-2.5">
        <h2 id="admin-base" className="text-sm font-semibold text-ink">
          Base da plataforma
        </h2>
        <MetricRow>
          <Metric label="Empresas" value={nf.format(ov.empresas)} href="/admin/empresas" />
          <Metric
            label="Usuários"
            value={nf.format(ov.usuarios)}
            detail={<span className="font-mono">{nf.format(ov.usuariosAtivos)} ativos</span>}
            href="/admin/usuarios"
          />
          <Metric label="Licitações coletadas" value={nf.format(ov.licitacoes)} />
          <Metric
            label="Itens monitorados"
            value={nf.format(ov.itensMonitorados)}
            detail={<span className="font-mono">{nf.format(ov.documentosNoCofre)} documentos no cofre</span>}
          />
        </MetricRow>
      </section>

      <section aria-labelledby="admin-atividade" className="flex flex-col gap-2.5">
        <h2 id="admin-atividade" className="text-sm font-semibold text-ink">
          Atividade
        </h2>
        <MetricRow>
          <Metric
            label="Chamadas de IA no mês"
            value={nf.format(ov.iaNoMes.chamadas)}
            detail={
              <span className="font-mono">
                {nf.format(ov.iaNoMes.tokensEntrada)} in · {nf.format(ov.iaNoMes.tokensSaida)} out
                {ov.iaNoMes.custoEstimadoUsd ? ` · ~US$ ${ov.iaNoMes.custoEstimadoUsd.toFixed(2)}` : ''}
              </span>
            }
            href="/admin/uso-ia"
          />
          <Metric
            label="Análises de edital"
            value={nf.format(totalDeAnalises)}
            detail={analises ? <span className="font-mono">{analises}</span> : 'nenhuma ainda'}
          />
          <Metric label="Auditoria (24 h)" value={nf.format(ov.eventosDeAuditoriaUltimas24h)} detail="eventos registrados" href="/admin/auditoria" />
        </MetricRow>
      </section>

      <p className="max-w-prose text-sm text-muted">
        Como administrador você enxerga todas as empresas, e tudo fica registrado na trilha de auditoria, inclusive as suas consultas aos
        dados dos clientes.
      </p>
    </div>
  )
}
