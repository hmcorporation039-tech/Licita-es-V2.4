'use client'

import { useState } from 'react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'

interface Contrato {
  id: string
  orgao: { cnpj: string; nome: string; uf: string | null; municipio: string | null }
  fornecedor: { ni: string; nome: string }
  objeto: string
  valorGlobal: number
  assinatura: string | null
  vigenciaFim: string | null
  categoria: string | null
  diasRestantes?: number
  noSeuRamo?: boolean
}
interface RespostaVencendo {
  totalVencendo: number
  termosUsados: string[]
  contratos: Contrato[]
}
interface Dossie {
  cnpj: string
  fornecedor: { ni: string; nome: string } | null
  totalDeContratos: number
  valorTotal: number
  primeiraAssinatura: string | null
  ultimaAssinatura: string | null
  porOrgao: { cnpj: string; nome: string; contratos: number; valor: number }[]
  porUf: { uf: string; contratos: number; valor: number }[]
  porCategoria: { categoria: string; contratos: number; valor: number }[]
  ultimosContratos: Contrato[]
  vencendoEm90Dias: Contrato[]
}
interface UasgBusca {
  codigoUasg: string
  nomeUasg: string
  nomeOrgao: string | null
  siglaUf: string | null
  cnpjOrgao: string | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

export default function RadarPage() {
  const user = useRequireSession()
  const [aba, setAba] = useState<'vencendo' | 'concorrente'>('vencendo')

  if (!user) return null
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Radar de oportunidades</h1>
      <p className="mt-1 text-sm text-slate-600">
        Dados públicos de contratos do PNCP: veja o que está para vencer nos órgãos que você atende e estude seus concorrentes.
      </p>
      <div className="mt-4 flex gap-2 border-b border-slate-200">
        {(
          [
            ['vencendo', 'Contratos vencendo'],
            ['concorrente', 'Dossiê de concorrente'],
          ] as const
        ).map(([k, rotulo]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-indigo-600 font-medium text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'vencendo' ? <ContratosVencendo /> : <DossieConcorrente />}
    </main>
  )
}

function ContratosVencendo() {
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<UasgBusca[]>([])
  const [orgao, setOrgao] = useState<{ cnpj: string; nome: string } | null>(null)
  const [dias, setDias] = useState(120)
  const [todos, setTodos] = useState(false)
  const [resp, setResp] = useState<RespostaVencendo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function procurarOrgao(q: string) {
    setBusca(q)
    const digitos = q.replace(/\D/g, '')
    if (digitos.length === 14) {
      setOrgao({ cnpj: digitos, nome: `CNPJ ${digitos}` })
      setOpcoes([])
      return
    }
    if (q.trim().length < 3) return setOpcoes([])
    try {
      const r = await api.get<UasgBusca[]>(`/api/uasg/search?q=${encodeURIComponent(q.trim())}`)
      setOpcoes(r.filter((o) => o.cnpjOrgao))
    } catch {
      setOpcoes([])
    }
  }

  async function consultar() {
    if (!orgao) return
    setCarregando(true)
    setErro(null)
    setResp(null)
    try {
      setResp(await api.get<RespostaVencendo>(`/api/radar/contratos-vencendo?cnpjOrgao=${orgao.cnpj}&dias=${dias}&todos=${todos ? 1 : 0}`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao consultar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[18rem] flex-1">
          <label className="block text-xs text-slate-600">Órgão (nome ou CNPJ)</label>
          <input
            value={orgao ? orgao.nome : busca}
            onChange={(e) => {
              setOrgao(null)
              void procurarOrgao(e.target.value)
            }}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Ex.: Prefeitura de Goiânia ou 01.612.092/0001-23"
          />
          {opcoes.length > 0 && !orgao && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-200 bg-white text-sm shadow">
              {opcoes.map((o) => (
                <li key={o.codigoUasg}>
                  <button
                    className="block w-full px-2 py-1.5 text-left hover:bg-slate-50"
                    onClick={() => {
                      setOrgao({ cnpj: o.cnpjOrgao!, nome: `${o.nomeOrgao ?? o.nomeUasg}${o.siglaUf ? ' — ' + o.siglaUf : ''}` })
                      setOpcoes([])
                    }}
                  >
                    {o.nomeOrgao ?? o.nomeUasg} {o.siglaUf && <span className="text-slate-500">({o.siglaUf})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-600">Vencem em até</label>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            {[30, 60, 90, 120, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1 pb-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Mostrar também fora do meu ramo
        </label>
        <button
          onClick={consultar}
          disabled={!orgao || carregando}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {carregando ? 'Consultando o PNCP…' : 'Consultar'}
        </button>
      </div>

      {erro && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {resp && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            {resp.totalVencendo} contrato(s) vencem nesse prazo
            {resp.termosUsados.length > 0 && !todos
              ? `; mostrando os que casam com seus itens monitorados (${resp.contratos.length}).`
              : resp.termosUsados.length === 0
                ? '. Cadastre itens monitorados com palavras-chave para destacar o que é do seu ramo.'
                : '.'}
          </p>
          <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">Vence</th>
                  <th className="px-3 py-2">Objeto</th>
                  <th className="px-3 py-2">Fornecedor atual</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resp.contratos.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      {data(c.vigenciaFim)}
                      <span className="block text-xs text-slate-500">em {c.diasRestantes} dia(s)</span>
                    </td>
                    <td className="px-3 py-2">
                      {c.noSeuRamo && <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800">no seu ramo</span>}
                      {c.objeto.slice(0, 220)}
                    </td>
                    <td className="px-3 py-2">
                      {c.fornecedor.nome}
                      <span className="block text-xs text-slate-500">{c.fornecedor.ni}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{brl(c.valorGlobal)}</td>
                  </tr>
                ))}
                {resp.contratos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nenhum contrato encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function DossieConcorrente() {
  const [cnpj, setCnpj] = useState('')
  const [d, setD] = useState<Dossie | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function consultar() {
    setCarregando(true)
    setErro(null)
    setD(null)
    try {
      setD(await api.get<Dossie>(`/api/radar/concorrente/${cnpj.replace(/\D/g, '')}`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao consultar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-600">CNPJ do concorrente</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="00.000.000/0000-00" />
        </div>
        <button
          onClick={consultar}
          disabled={cnpj.replace(/\D/g, '').length !== 14 || carregando}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {carregando ? 'Consultando o PNCP…' : 'Gerar dossiê'}
        </button>
      </div>
      {erro && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {d && d.totalDeContratos === 0 && <p className="mt-4 text-sm text-slate-600">Nenhum contrato público encontrado para esse CNPJ nos últimos 2 anos.</p>}
      {d && d.totalDeContratos > 0 && (
        <div className="mt-4 space-y-4">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-medium text-slate-900">{d.fornecedor?.nome}</h2>
            <p className="text-sm text-slate-600">
              {d.totalDeContratos} contrato(s), {brl(d.valorTotal)} no total · de {data(d.primeiraAssinatura)} a {data(d.ultimaAssinatura)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Considera os contratos publicados no PNCP nos últimos 2 anos (até 2.000 por período).</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Lista titulo="Principais órgãos" linhas={d.porOrgao.map((o) => [o.nome, `${o.contratos} · ${brl(o.valor)}`])} />
            <Lista titulo="Por estado" linhas={d.porUf.slice(0, 10).map((u) => [u.uf, `${u.contratos} · ${brl(u.valor)}`])} />
            <Lista titulo="Por categoria" linhas={d.porCategoria.map((c) => [c.categoria, `${c.contratos} · ${brl(c.valor)}`])} />
          </div>
          <Lista
            titulo="Contratos dele que vencem em 90 dias (chance de disputar)"
            linhas={d.vencendoEm90Dias.slice(0, 15).map((c) => [`${data(c.vigenciaFim)} — ${c.orgao.nome}: ${c.objeto.slice(0, 90)}`, brl(c.valorGlobal)])}
          />
          <Lista
            titulo="Últimos contratos assinados"
            linhas={d.ultimosContratos.map((c) => [`${data(c.assinatura)} — ${c.orgao.nome}: ${c.objeto.slice(0, 90)}`, brl(c.valorGlobal)])}
          />
        </div>
      )}
    </section>
  )
}

function Lista({ titulo, linhas }: { titulo: string; linhas: [string, string][] }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-medium text-slate-800">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-slate-500">Nada a mostrar.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {linhas.map(([a, b], i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-slate-700">{a}</span>
              <span className="whitespace-nowrap text-slate-500">{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
