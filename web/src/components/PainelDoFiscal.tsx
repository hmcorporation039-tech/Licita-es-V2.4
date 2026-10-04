'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import type { PainelDoFiscal as Painel, RequisitoDeHabilitacao, StatusHabilitacao } from '@/lib/adminTypes'

const COR: Record<StatusHabilitacao, { ponto: string; chip: string; rotulo: string }> = {
  verde: { ponto: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800', rotulo: 'Em dia' },
  amarelo: { ponto: 'bg-amber-400', chip: 'bg-amber-100 text-amber-900', rotulo: 'Renovar' },
  vermelho: { ponto: 'bg-red-500', chip: 'bg-red-100 text-red-800', rotulo: 'Pendente' },
  cinza: { ponto: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600', rotulo: 'Conferir' },
}

const ORDEM: StatusHabilitacao[] = ['vermelho', 'amarelo', 'cinza', 'verde']

const ORIGEM: Record<RequisitoDeHabilitacao['origem'], string> = {
  padrao: 'padrão da Lei 14.133',
  edital: 'citado no edital',
  'a-confirmar': 'só se o edital exigir',
  extra: 'específico do edital',
}

function dia(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Painel do "Fiscal": o que o edital pede × o cofre da empresa, na data da
// sessão, e alertas sobre exigências que parecem passar dos limites da lei.
export default function PainelDoFiscal({ tenderId }: { tenderId: string }) {
  const [dados, setDados] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<StatusHabilitacao | 'todos'>('todos')

  useEffect(() => {
    api
      .get<Painel>(`/api/tenders/${tenderId}/habilitacao`)
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [tenderId])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!dados) return <p className="text-sm text-slate-500">Carregando...</p>

  const { habilitacao: h, alertas, prazos } = dados
  const visiveis = h.requisitos.filter((r) => filtro === 'todos' || r.status === filtro)
  const porSecao = new Map<string, RequisitoDeHabilitacao[]>()
  for (const r of visiveis) porSecao.set(r.section, [...(porSecao.get(r.section) ?? []), r])

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Habilitação: o que o edital pede × o seu cofre</h2>
        <p className="mt-1 text-sm text-slate-500">
          {h.referencia.dataSessao
            ? `Validade conferida na data da sessão: ${dia(h.referencia.dataSessao)}.`
            : 'A licitação não informa a data da sessão: a validade foi conferida contra hoje.'}
          {!dados.analise.feita && ' Rode a análise do edital (aba Análise) para saber quais documentos específicos ele exige.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setFiltro('todos')}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === 'todos' ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-600'}`}
          >
            Todos ({h.requisitos.length})
          </button>
          {ORDEM.map((s) => (
            <button
              key={s}
              onClick={() => setFiltro(filtro === s ? 'todos' : s)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${filtro === s ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-600'}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${COR[s].ponto}`} />
              {COR[s].rotulo} ({h.resumo[s]})
            </button>
          ))}
        </div>

        <p className={`mt-3 text-sm font-medium ${h.semPendenciaBloqueante ? 'text-emerald-700' : 'text-red-700'}`}>
          {h.semPendenciaBloqueante
            ? 'Nenhum documento pendente pelo que o cofre sabe. Ainda confira os itens em cinza.'
            : `${h.resumo.vermelho} documento(s) pendente(s): resolva antes da sessão.`}
        </p>
      </section>

      {alertas.disponivel ? (
        alertas.itens.length > 0 && (
          <section className="rounded border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-900">Exigências que parecem passar dos limites da lei</h2>
            <p className="mt-1 text-xs text-red-800">{alertas.aviso}</p>
            {prazos && !prazos.sessaoPassou && (
              <p className="mt-2 text-sm text-red-900">
                Para impugnar ou pedir esclarecimento: até <strong>{dia(prazos.limiteImpugnacao)}</strong>{' '}
                {prazos.limitePassou ? '(o prazo já terminou)' : `(${prazos.diasUteisAteLimite} dia(s) útil(eis))`}.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {alertas.itens.map((a) => (
                <li key={a.id} className="rounded border border-red-200 bg-white p-3 text-sm">
                  <p className="font-medium text-slate-900">
                    ⚠ {a.titulo}{' '}
                    <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${a.gravidade === 'alta' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                      {a.gravidade === 'alta' ? 'alta' : 'média'}
                    </span>
                  </p>
                  <p className="mt-1 text-slate-700">{a.detalhe}</p>
                  <p className="mt-1 text-xs text-slate-500">Base: {a.fundamento}</p>
                  <blockquote className="mt-2 border-l-2 border-slate-300 pl-2 text-xs italic text-slate-600">{a.trecho}</blockquote>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <p className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500">
          {dados.analise.feita
            ? 'Esta análise é anterior aos alertas sobre garantias, patrimônio líquido e visita técnica. Peça uma nova análise ao administrador para habilitá-los.'
            : 'Os alertas sobre garantias, patrimônio líquido e visita técnica aparecem depois que a análise do edital é feita.'}
        </p>
      )}

      {[...porSecao.entries()].map(([secao, itens]) => (
        <section key={secao} className="rounded border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-medium text-slate-800">{secao}</h3>
          <ul className="flex flex-col divide-y divide-slate-100">
            {itens.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COR[r.status].ponto}`} aria-label={COR[r.status].rotulo} />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900">
                    {r.label} <span className="text-xs text-slate-400">· {ORIGEM[r.origem]}</span>
                  </p>
                  <p className="text-slate-600">{r.motivo}</p>
                  {r.acao && <p className="text-xs text-slate-500">→ {r.acao}</p>}
                  {r.citadoNoEdital.length > 0 && r.origem !== 'extra' && (
                    <p className="mt-0.5 text-xs text-slate-400">Edital: {r.citadoNoEdital.join(' · ')}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COR[r.status].chip}`}>{COR[r.status].rotulo}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-slate-500">
        O cofre guarda a descrição e a validade dos documentos (não o arquivo). Cadastre e atualize em{' '}
        <Link href="/empresa" className="text-indigo-700 hover:underline">
          Empresa
        </Link>
        .
      </p>
    </div>
  )
}
