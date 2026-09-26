'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api } from '@/lib/api'
import { Paginated, Tender } from '@/lib/types'
import { MODALIDADE_OPTIONS } from '@/lib/modalidades'
import { SITUACAO_OPTIONS } from '@/lib/situacoes'

function formatValor(v: string | null) {
  if (!v) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const CLASSIFICACAO_LABEL: Record<string, string> = {
  exata: 'Correspondência exata (código)',
  alta: 'Alta relevância',
  media: 'Relevância média',
}

const CLASSIFICACAO_CLASS: Record<string, string> = {
  exata: 'bg-emerald-100 text-emerald-800',
  alta: 'bg-indigo-100 text-indigo-800',
  media: 'bg-amber-100 text-amber-800',
}

function TenderRow({ t, somenteRelacionadas }: { t: Tender; somenteRelacionadas: boolean }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-3 py-2">
        <Link href={`/tenders/${t.id}`} className="font-medium text-indigo-700 hover:underline">
          {t.orgao ?? 'Órgão n/d'}
        </Link>
        <p className="mt-0.5 max-w-md truncate text-xs text-slate-500" title={t.objetoResumido ?? t.objeto}>
          {t.objetoResumido ?? t.objeto}
        </p>
      </td>
      <td className="px-3 py-2 text-slate-600">{t.numeroControle ?? '—'}</td>
      <td className="px-3 py-2 text-slate-600">
        {MODALIDADE_OPTIONS.find((o) => o.value === t.modalidade)?.label ?? t.modalidade}
      </td>
      <td className="px-3 py-2 text-slate-600">{t.municipio ? `${t.municipio}/${t.uf ?? ''}` : t.uf ?? 'n/d'}</td>
      <td className="px-3 py-2 text-slate-600">
        {SITUACAO_OPTIONS.find((o) => o.value === t.situacao)?.label ?? t.situacao}
      </td>
      <td className="px-3 py-2 text-slate-600">{formatData(t.publicadoAt)}</td>
      <td className="px-3 py-2 text-slate-600">{formatValor(t.valorEstimado)}</td>
      {somenteRelacionadas && (
        <td className="px-3 py-2">
          {t.match && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICACAO_CLASS[t.match.classificacao]}`}
              title={t.match.itensRelacionados.join(', ')}
            >
              {CLASSIFICACAO_LABEL[t.match.classificacao]}
            </span>
          )}
        </td>
      )}
    </tr>
  )
}

export default function TendersPage() {
  const user = useRequireSession()
  const [data, setData] = useState<Paginated<Tender> | null>(null)
  const [loading, setLoading] = useState(true)

  // Filtros — no estilo da barra de busca da BLL (Promotor, Nº Edital,
  // Modalidade, Situação, Cidade, Estado, datas de publicação)
  const [orgao, setOrgao] = useState('')
  const [numero, setNumero] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [situacao, setSituacao] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [publicacaoInicio, setPublicacaoInicio] = useState('')
  const [publicacaoFim, setPublicacaoFim] = useState('')
  const [q, setQ] = useState('')
  const [somenteRelacionadas, setSomenteRelacionadas] = useState(true)
  // Organiza o resultado por Estado e depois por Órgão/Prefeitura, em vez
  // do feed cronológico — é o modo padrão porque foi o pedido original;
  // pageSize maior aqui pra grupos não ficarem cortados a cada 20 linhas.
  const [agrupar, setAgrupar] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const timeout = setTimeout(() => {
      const qs = new URLSearchParams({ page: String(page), pageSize: agrupar ? '100' : '20' })
      if (orgao) qs.set('orgao', orgao)
      if (numero) qs.set('numero', numero)
      if (modalidade) qs.set('modalidade', modalidade)
      if (situacao) qs.set('situacao', situacao)
      if (municipio) qs.set('municipio', municipio)
      if (uf) qs.set('uf', uf)
      if (publicacaoInicio) qs.set('publicacaoInicio', publicacaoInicio)
      if (publicacaoFim) qs.set('publicacaoFim', publicacaoFim)
      if (q) qs.set('q', q)
      if (somenteRelacionadas) qs.set('somenteRelacionadas', 'true')
      if (agrupar) qs.set('agrupar', 'true')
      api
        .get<Paginated<Tender>>(`/api/tenders?${qs.toString()}`)
        .then(setData)
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [user, orgao, numero, modalidade, situacao, municipio, uf, publicacaoInicio, publicacaoFim, q, somenteRelacionadas, agrupar, page])

  // Agrupa a lista já ordenada (uf → órgão) vinda do backend em UF > Órgão >
  // licitações, pra render em seções em vez de uma tabela só.
  const grupos = (() => {
    if (!agrupar || !data) return null
    const porUf = new Map<string, Map<string, Tender[]>>()
    for (const t of data.items) {
      const ufKey = t.uf ?? 'UF não informada'
      const orgaoKey = t.orgao ?? 'Órgão não informado'
      if (!porUf.has(ufKey)) porUf.set(ufKey, new Map())
      const porOrgao = porUf.get(ufKey)!
      if (!porOrgao.has(orgaoKey)) porOrgao.set(orgaoKey, [])
      porOrgao.get(orgaoKey)!.push(t)
    }
    return Array.from(porUf.entries()).map(([uf, porOrgao]) => ({
      uf,
      total: Array.from(porOrgao.values()).reduce((n, arr) => n + arr.length, 0),
      orgaos: Array.from(porOrgao.entries()).map(([orgao, tenders]) => ({ orgao, tenders })),
    }))
  })()

  function clearFilters() {
    setPage(1)
    setOrgao('')
    setNumero('')
    setModalidade('')
    setSituacao('')
    setMunicipio('')
    setUf('')
    setPublicacaoInicio('')
    setPublicacaoFim('')
    setQ('')
  }

  if (!user) return null

  const inputClass = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'
  const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Licitações</h1>

      <div className="mb-4 rounded border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass}>Órgão</label>
            <input
              placeholder="Ex: Prefeitura de Uberlândia"
              value={orgao}
              onChange={(e) => {
                setPage(1)
                setOrgao(e.target.value)
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Nº edital / processo</label>
            <input
              value={numero}
              onChange={(e) => {
                setPage(1)
                setNumero(e.target.value)
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Modalidade</label>
            <select
              value={modalidade}
              onChange={(e) => {
                setPage(1)
                setModalidade(e.target.value)
              }}
              className={inputClass}
            >
              <option value="">Todas</option>
              {MODALIDADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Situação</label>
            <select
              value={situacao}
              onChange={(e) => {
                setPage(1)
                setSituacao(e.target.value)
              }}
              className={inputClass}
            >
              <option value="">Todas</option>
              {SITUACAO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="mt-3 text-xs font-medium text-indigo-700 hover:underline"
        >
          {advancedOpen ? 'Ocultar busca avançada' : 'Busca avançada'}
        </button>

        {advancedOpen && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass}>Cidade</label>
              <input
                value={municipio}
                onChange={(e) => {
                  setPage(1)
                  setMunicipio(e.target.value)
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>UF</label>
              <input
                maxLength={2}
                value={uf}
                onChange={(e) => {
                  setPage(1)
                  setUf(e.target.value.toUpperCase())
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Publicação — início</label>
              <input
                type="date"
                value={publicacaoInicio}
                onChange={(e) => {
                  setPage(1)
                  setPublicacaoInicio(e.target.value)
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Publicação — fim</label>
              <input
                type="date"
                value={publicacaoFim}
                onChange={(e) => {
                  setPage(1)
                  setPublicacaoFim(e.target.value)
                }}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className={labelClass}>Buscar no objeto</label>
              <input
                value={q}
                onChange={(e) => {
                  setPage(1)
                  setQ(e.target.value)
                }}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={somenteRelacionadas}
                onChange={(e) => {
                  setPage(1)
                  setSomenteRelacionadas(e.target.checked)
                }}
              />
              Só relacionadas aos meus itens monitorados
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={agrupar}
                onChange={(e) => {
                  setPage(1)
                  setAgrupar(e.target.checked)
                }}
              />
              Agrupar por Estado e Órgão
            </label>
          </div>
          <div className="flex items-center gap-3">
            {data && <span className="text-sm text-slate-500">{data.total} licitação(ões) encontrada(s)</span>}
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Limpar todas as pesquisas
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : data?.items.length === 0 ? (
        <p className="text-sm text-slate-500">
          {somenteRelacionadas
            ? 'Nenhuma licitação relacionada aos seus itens monitorados até agora. Cadastre itens em "Itens monitorados" ou desmarque o filtro acima para ver o feed completo.'
            : 'Nenhuma licitação encontrada com esses filtros.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Órgão</th>
                  <th className="px-3 py-2 font-medium">Número</th>
                  <th className="px-3 py-2 font-medium">Modalidade</th>
                  <th className="px-3 py-2 font-medium">Cidade/UF</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Publicação</th>
                  <th className="px-3 py-2 font-medium">Valor estimado</th>
                  {somenteRelacionadas && <th className="px-3 py-2 font-medium">Relevância</th>}
                </tr>
              </thead>
              <tbody>
                {grupos
                  ? grupos.map((g) => (
                      <Fragment key={`uf-${g.uf}`}>
                        <tr className="bg-slate-100">
                          <td
                            colSpan={somenteRelacionadas ? 8 : 7}
                            className="px-3 py-1.5 text-sm font-semibold text-slate-700"
                          >
                            {g.uf} <span className="font-normal text-slate-500">— {g.total} licitação(ões)</span>
                          </td>
                        </tr>
                        {g.orgaos.map((og) => (
                          <Fragment key={`orgao-${g.uf}-${og.orgao}`}>
                            <tr className="bg-slate-50">
                              <td
                                colSpan={somenteRelacionadas ? 8 : 7}
                                className="px-3 py-1 pl-6 text-xs font-medium uppercase tracking-wide text-slate-500"
                              >
                                {og.orgao} <span className="normal-case text-slate-400">({og.tenders.length})</span>
                              </td>
                            </tr>
                            {og.tenders.map((t) => (
                              <TenderRow key={t.id} t={t} somenteRelacionadas={somenteRelacionadas} />
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  : data?.items.map((t) => (
                      <TenderRow key={t.id} t={t} somenteRelacionadas={somenteRelacionadas} />
                    ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>
                Página {data.page} de {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
