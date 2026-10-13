'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import { ROTULO_ACAO } from '@/lib/adminTypes'
import type { DetalheEmpresa, Limites, PlanoComercial } from '@/lib/adminTypes'

const data = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')
const dataHora = (v: string) => new Date(v).toLocaleString('pt-BR')

export default function AdminEmpresaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <AdminShell titulo="Empresa">{() => <Conteudo id={id} />}</AdminShell>
}

const CAMPOS: { chave: keyof Limites; rotulo: string }[] = [
  { chave: 'itensMonitorados', rotulo: 'Itens monitorados' },
  { chave: 'usuarios', rotulo: 'Usuários' },
  { chave: 'analisesIaMes', rotulo: 'Análises de IA / mês' },
]

function Conteudo({ id }: { id: string }) {
  const [d, setD] = useState<DetalheEmpresa | null>(null)
  const [planos, setPlanos] = useState<PlanoComercial[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [planCode, setPlanCode] = useState('')
  // texto: '' = vale o plano; 'ilimitado' = null; número = limite
  const [ajustes, setAjustes] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [det, pl] = await Promise.all([
        api.get<DetalheEmpresa>(`/api/admin/companies/${id}`),
        api.get<PlanoComercial[]>('/api/admin/plans'),
      ])
      setD(det)
      setPlanos(pl)
      setPlanCode(det.empresa.planCode)
      const a: Record<string, string> = {}
      for (const c of CAMPOS) {
        const v = det.empresa.quotaOverrides?.[c.chave]
        a[c.chave] = v === undefined ? '' : v === null ? 'ilimitado' : String(v)
      }
      setAjustes(a)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    setErro(null)
    try {
      const overrides: Record<string, number | null> = {}
      for (const c of CAMPOS) {
        const t = (ajustes[c.chave] ?? '').trim().toLowerCase()
        if (t === '') continue
        if (t === 'ilimitado') overrides[c.chave] = null
        else if (/^\d+$/.test(t)) overrides[c.chave] = Number(t)
        else throw new ApiRequestError(400, `Valor inválido em "${c.rotulo}": use um número inteiro ou "ilimitado"`)
      }
      await api.patch(`/api/admin/companies/${id}`, {
        planCode,
        quotaOverrides: Object.keys(overrides).length ? overrides : null,
      })
      setMsg('Plano e limites salvos.')
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (erro && !d) return <p className="text-sm text-red-600">{erro}</p>
  if (!d) return <p className="text-sm text-slate-500">Carregando...</p>

  const e = d.empresa
  const secao = 'rounded border border-slate-200 bg-white p-4'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/empresas" className="text-sm text-indigo-700 hover:underline">
          ← Empresas
        </Link>
        <h2 className="mt-1 text-lg font-semibold">{e.name}</h2>
        <p className="text-sm text-slate-500">
          {e.cnpj ?? e.cpf ?? 'sem documento'} · {e.email ?? 'sem e-mail'} · criada em {data(e.createdAt)}
        </p>
        <p className="mt-1 text-xs text-slate-400">Esta consulta foi registrada na trilha de auditoria.</p>
      </div>

      <section className={secao}>
        <h3 className="mb-3 text-sm font-medium">Plano e limites</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs text-slate-600">
            Plano
            <select value={planCode} onChange={(ev) => setPlanCode(ev.target.value)} className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm">
              {planos.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                  {p.active ? '' : ' (inativo)'}
                </option>
              ))}
            </select>
          </label>
          {CAMPOS.map((c) => (
            <label key={c.chave} className="flex flex-col text-xs text-slate-600">
              Ajuste: {c.rotulo}
              <input
                value={ajustes[c.chave] ?? ''}
                onChange={(ev) => setAjustes({ ...ajustes, [c.chave]: ev.target.value })}
                placeholder="vale o plano"
                className="mt-1 w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          ))}
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Ajuste em branco = vale o limite do plano. Escreva um número, ou &quot;ilimitado&quot;, para combinar um limite diferente só com esta
          empresa.
        </p>
        {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}

        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {d.cotas.recursos.map((r) => (
            <li key={r.recurso} className="rounded bg-slate-50 p-3 text-sm">
              <p className="text-xs capitalize text-slate-500">{r.rotulo}</p>
              <p className={`text-lg font-semibold ${r.excedido ? 'text-red-600' : 'text-slate-900'}`}>
                {r.usado} / {r.limite === null ? '∞' : r.limite}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          IA acumulada: {d.iaAcumulada.chamadas} chamadas · {d.iaAcumulada.tokensEntrada.toLocaleString('pt-BR')} tokens de entrada ·{' '}
          {d.iaAcumulada.tokensSaida.toLocaleString('pt-BR')} de saída
          {d.iaAcumulada.custoEstimadoUsd ? ` · ~US$ ${d.iaAcumulada.custoEstimadoUsd.toFixed(2)}` : ''}
        </p>
      </section>

      <section className={secao}>
        <h3 className="mb-2 text-sm font-medium">Usuários ({d.usuarios.length})</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">E-mail</th>
              <th>Papel</th>
              <th>Situação</th>
              <th>Acesso até</th>
            </tr>
          </thead>
          <tbody>
            {d.usuarios.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="py-1.5">
                  {u.email}
                  {u.isAdmin && <span className="ml-1 rounded bg-indigo-100 px-1 text-xs text-indigo-800">admin</span>}
                </td>
                <td>{u.companyRole === 'OWNER' ? 'Dono' : 'Membro'}</td>
                <td>{u.active ? 'ativo' : u.disabledByAdmin ? 'desativado pelo admin' : 'inativo'}</td>
                <td>{u.accessExpiresAt ? data(u.accessExpiresAt) : 'sem prazo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={secao}>
        <h3 className="mb-2 text-sm font-medium">Itens monitorados ({d.itensMonitorados.length}) · {d.matches} matches</h3>
        {d.itensMonitorados.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum item.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.itensMonitorados.map((i) => (
              <li key={i.id} className="border-t border-slate-100 py-1">
                <span className="font-medium">{i.name}</span>{' '}
                <span className="text-xs text-slate-500">
                  {[...i.keywords, ...i.catmatCodes.map((c) => `CATMAT ${c}`), ...i.catserCodes.map((c) => `CATSER ${c}`)].slice(0, 6).join(', ')}
                  {i.ufs.length ? ` · ${i.ufs.join('/')}` : ' · nacional'}
                  {i.active ? '' : ' · inativo'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={secao}>
        <h3 className="mb-2 text-sm font-medium">Cofre de documentos ({d.documentos.length})</h3>
        <p className="mb-2 text-xs text-slate-500">Só os metadados: o cofre não armazena o arquivo.</p>
        {d.documentos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum documento.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.documentos.map((doc) => {
              const vencido = doc.dataValidade && new Date(doc.dataValidade).getTime() < Date.now()
              return (
                <li key={doc.id} className="flex justify-between border-t border-slate-100 py-1">
                  <span>{doc.nome}</span>
                  <span className={vencido ? 'text-red-600' : 'text-slate-500'}>
                    {doc.dataValidade ? `validade ${data(doc.dataValidade)}${vencido ? ' (vencido)' : ''}` : 'sem validade'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={secao}>
        <h3 className="mb-2 text-sm font-medium">Decisões de participação ({d.planosDeParticipacao.length})</h3>
        {d.planosDeParticipacao.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.planosDeParticipacao.map((p) => (
              <li key={p.tenderId} className="border-t border-slate-100 py-1">
                <span className="rounded bg-slate-100 px-1.5 text-xs">{p.status.replace(/_/g, ' ').toLowerCase()}</span>{' '}
                <Link href={`/tenders/${p.tenderId}`} className="text-indigo-700 hover:underline">
                  {p.tender.objeto.slice(0, 110)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={secao}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Atividade recente</h3>
          <Link href={`/admin/auditoria?companyId=${e.id}`} className="text-xs text-indigo-700 hover:underline">
            ver tudo na auditoria →
          </Link>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {d.auditoriaRecente.map((ev) => (
            <li key={ev.id} className="border-t border-slate-100 py-1">
              <span className="text-xs text-slate-400">{dataHora(ev.createdAt)}</span> · {ROTULO_ACAO[ev.action] ?? ev.action}
              <span className="text-xs text-slate-500"> · {ev.actorEmail ?? 'sistema'}</span>
            </li>
          ))}
          {d.auditoriaRecente.length === 0 && <li className="text-slate-500">Sem eventos.</li>}
        </ul>
      </section>
    </div>
  )
}
