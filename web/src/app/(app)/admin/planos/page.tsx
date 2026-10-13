'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { Limites, PlanoComercial } from '@/lib/adminTypes'

const CAMPOS: { chave: keyof Limites; rotulo: string }[] = [
  { chave: 'itensMonitorados', rotulo: 'Itens monitorados' },
  { chave: 'usuarios', rotulo: 'Usuários' },
  { chave: 'analisesIaMes', rotulo: 'Análises de IA / mês' },
]

export default function AdminPlanosPage() {
  return <AdminShell titulo="Planos">{() => <Conteudo />}</AdminShell>
}

const paraTexto = (v: number | null) => (v === null ? 'ilimitado' : String(v))

function lerLimite(texto: string): number | null {
  const t = texto.trim().toLowerCase()
  if (t === 'ilimitado') return null
  if (/^\d+$/.test(t)) return Number(t)
  throw new Error('Use um número inteiro ou "ilimitado"')
}

function Conteudo() {
  const [planos, setPlanos] = useState<PlanoComercial[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setPlanos(await api.get<PlanoComercial[]>('/api/admin/plans'))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Os limites abaixo são pontos de partida: ajuste conforme o custo real de IA (veja &quot;Consumo de IA&quot;) e o que você quiser
        oferecer. A cobrança ainda não está ligada, então não há preço nesta tela.
      </p>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {planos.map((p) => (
          <CartaoPlano key={p.code} plano={p} onSalvo={() => { setMsg(`Plano ${p.name} salvo.`); setErro(null); carregar() }} onErro={setErro} />
        ))}
      </div>
      <NovoPlano onCriado={() => { setMsg('Plano criado.'); setErro(null); carregar() }} onErro={setErro} />
    </div>
  )
}

function CartaoPlano({ plano, onSalvo, onErro }: { plano: PlanoComercial; onSalvo: () => void; onErro: (m: string) => void }) {
  const [nome, setNome] = useState(plano.name)
  const [ativo, setAtivo] = useState(plano.active)
  const [limites, setLimites] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.chave, paraTexto(plano.limits[c.chave])]))
  )

  async function salvar() {
    try {
      const l = Object.fromEntries(CAMPOS.map((c) => [c.chave, lerLimite(limites[c.chave])]))
      await api.put(`/api/admin/plans/${plano.code}`, { name: nome, active: ativo, limits: l })
      onSalvo()
    } catch (e) {
      onErro(e instanceof ApiRequestError || e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-500">{plano.code}</span>
        <span className="text-xs text-slate-500">{plano.empresas} empresa(s)</span>
      </div>
      <input value={nome} onChange={(e) => setNome(e.target.value)} className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-medium" />
      <div className="flex flex-col gap-2">
        {CAMPOS.map((c) => (
          <label key={c.chave} className="flex items-center justify-between gap-3 text-sm text-slate-600">
            {c.rotulo}
            <input
              value={limites[c.chave]}
              onChange={(e) => setLimites({ ...limites, [c.chave]: e.target.value })}
              className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Plano ativo
      </label>
      <button onClick={salvar} className="mt-3 rounded bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800">
        Salvar
      </button>
    </div>
  )
}

function NovoPlano({ onCriado, onErro }: { onCriado: () => void; onErro: (m: string) => void }) {
  const [code, setCode] = useState('')
  const [nome, setNome] = useState('')

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/admin/plans', {
        code: code.trim().toUpperCase(),
        name: nome.trim(),
        limits: { itensMonitorados: 3, usuarios: 1, analisesIaMes: 3 },
      })
      setCode('')
      setNome('')
      onCriado()
    } catch (err) {
      onErro(err instanceof ApiRequestError ? err.message : 'Erro ao criar')
    }
  }

  return (
    <form onSubmit={criar} className="flex flex-wrap items-end gap-3 rounded border border-dashed border-slate-300 p-4">
      <label className="flex flex-col text-xs text-slate-600">
        Código (MAIÚSCULAS)
        <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ESPECIAL" className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        Nome
        <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Especial" className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <button className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Criar plano (limites iniciais baixos)</button>
    </form>
  )
}
