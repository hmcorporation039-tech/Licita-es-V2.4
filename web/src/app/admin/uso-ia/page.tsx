'use client'

import { useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { UsoIaResposta } from '@/lib/adminTypes'

const nf = new Intl.NumberFormat('pt-BR')
const usd = (v: number) => (v ? `US$ ${v.toFixed(2)}` : '—')

export default function AdminUsoIaPage() {
  return <AdminShell titulo="Consumo de IA">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [d, setD] = useState<UsoIaResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<UsoIaResposta>('/api/admin/ai-usage')
      .then(setD)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!d) return <p className="text-sm text-slate-500">Carregando...</p>

  const secao = 'rounded border border-slate-200 bg-white p-4'
  const th = 'px-2 py-1 text-xs uppercase text-slate-500'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Período: desde {new Date(d.periodo.de).toLocaleDateString('pt-BR')} (mês corrente). {d.total.chamadas} chamadas ·{' '}
        {nf.format(d.total.tokensEntrada)} tokens de entrada · {nf.format(d.total.tokensSaida)} de saída · custo estimado{' '}
        {usd(d.total.custoEstimadoUsd)}
      </p>

      <section className={secao}>
        <h2 className="mb-2 text-sm font-medium">Por empresa (quem pediu a análise)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className={th}>Empresa</th>
                <th className={th}>Plano</th>
                <th className={`${th} text-right`}>Chamadas</th>
                <th className={`${th} text-right`}>Tokens in</th>
                <th className={`${th} text-right`}>Tokens out</th>
                <th className={`${th} text-right`}>Custo est.</th>
              </tr>
            </thead>
            <tbody>
              {d.porEmpresa.map((e) => (
                <tr key={e.companyId ?? 'sem'} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{e.empresa}</td>
                  <td className="px-2 py-1.5">{e.planCode ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">{e.chamadas}</td>
                  <td className="px-2 py-1.5 text-right">{nf.format(e.tokensEntrada)}</td>
                  <td className="px-2 py-1.5 text-right">{nf.format(e.tokensSaida)}</td>
                  <td className="px-2 py-1.5 text-right">{usd(e.custoEstimadoUsd)}</td>
                </tr>
              ))}
              {d.porEmpresa.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                    Nenhuma chamada de IA neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={secao}>
        <h2 className="mb-1 text-sm font-medium">Por etapa e modelo</h2>
        <p className="mb-2 text-xs text-slate-500">
          Cada análise tem duas etapas: o analista lê o edital e o revisor o confere. A revisão é custo da plataforma: não conta na cota do cliente.
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className={th}>Etapa</th>
              <th className={th}>Modelo</th>
              <th className={`${th} text-right`}>Chamadas</th>
              <th className={`${th} text-right`}>Tokens in</th>
              <th className={`${th} text-right`}>Tokens out</th>
              <th className={`${th} text-right`}>Custo est.</th>
            </tr>
          </thead>
          <tbody>
            {d.porEtapa.map((e) => (
              <tr key={`${e.etapa}-${e.provider}-${e.model}`} className="border-t border-slate-100">
                <td className="px-2 py-1.5">{e.etapa === 'revisao' ? 'Revisão' : 'Análise'}</td>
                <td className="px-2 py-1.5">
                  {e.provider} / {e.model}
                </td>
                <td className="px-2 py-1.5 text-right">{e.chamadas}</td>
                <td className="px-2 py-1.5 text-right">{nf.format(e.tokensEntrada)}</td>
                <td className="px-2 py-1.5 text-right">{nf.format(e.tokensSaida)}</td>
                <td className="px-2 py-1.5 text-right">{usd(e.custoEstimadoUsd)}</td>
              </tr>
            ))}
            {d.porEtapa.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                  Nenhuma chamada neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className={secao}>
        <h2 className="mb-2 text-sm font-medium">Por mês</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className={th}>Mês</th>
              <th className={`${th} text-right`}>Chamadas</th>
              <th className={`${th} text-right`}>Tokens in</th>
              <th className={`${th} text-right`}>Tokens out</th>
              <th className={`${th} text-right`}>Custo est.</th>
            </tr>
          </thead>
          <tbody>
            {d.porMes.map((m) => (
              <tr key={m.mes} className="border-t border-slate-100">
                <td className="px-2 py-1.5">{m.mes}</td>
                <td className="px-2 py-1.5 text-right">{m.chamadas}</td>
                <td className="px-2 py-1.5 text-right">{nf.format(m.tokensEntrada)}</td>
                <td className="px-2 py-1.5 text-right">{nf.format(m.tokensSaida)}</td>
                <td className="px-2 py-1.5 text-right">{usd(m.custoEstimadoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={secao}>
        <h2 className="mb-2 text-sm font-medium">Últimas chamadas</h2>
        <ul className="flex flex-col gap-1 text-xs text-slate-600">
          {d.recentes.map((r) => (
            <li key={r.id} className="border-t border-slate-100 py-1">
              {new Date(r.createdAt).toLocaleString('pt-BR')} · {r.provider}/{r.model} · {nf.format(r.inputTokens)} in /{' '}
              {nf.format(r.outputTokens)} out ·{' '}
              <span className={r.status === 'OK' ? 'text-emerald-700' : 'text-red-700'}>{r.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-slate-500">{d.aviso}</p>
    </div>
  )
}
