'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { Limites, PlanoComercial } from '@/lib/adminTypes'
import { Button, Carregando, Checkbox, EmptyState, ErrorState, Field, Input, Notice, Panel, StatusTag, cx } from '@/components/ui'

const CAMPOS: { chave: keyof Limites; rotulo: string }[] = [
  { chave: 'itensMonitorados', rotulo: 'Itens monitorados' },
  { chave: 'usuarios', rotulo: 'Usuários' },
  { chave: 'analisesIaMes', rotulo: 'Análises de IA / mês' },
  { chave: 'perguntasAoEditalMes', rotulo: 'Perguntas ao edital / mês' },
  { chave: 'mensagensDeSuporteMes', rotulo: 'Mensagens ao atendimento / mês' },
  { chave: 'analisesDeConcorrenteMes', rotulo: 'Análises de concorrente / mês' },
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
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setPlanos(await api.get<PlanoComercial[]>('/api/admin/plans'))
      setCarregado(true)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar')
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!carregado && erro)
    return (
      <ErrorState
        message={erro}
        onRetry={() => {
          setErro(null)
          carregar()
        }}
      />
    )
  if (!carregado) return <Carregando linhas={6} />

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted">
        Os limites abaixo são pontos de partida: ajuste conforme o custo real de IA (veja &quot;Consumo de IA&quot;) e o que você quiser oferecer.
        A cobrança ainda não está ligada, então não há preço nesta tela.
      </p>
      {msg && <Notice tone="ok">{msg}</Notice>}
      {erro && <Notice tone="danger">{erro}</Notice>}
      {planos.length === 0 ? (
        <EmptyState title="Nenhum plano cadastrado." description="Crie o primeiro plano no formulário abaixo." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {planos.map((p) => (
            <CartaoPlano
              key={p.code}
              plano={p}
              onSalvo={() => {
                setMsg(`Plano ${p.name} salvo.`)
                setErro(null)
                carregar()
              }}
              onErro={setErro}
            />
          ))}
        </div>
      )}
      <NovoPlano
        onCriado={() => {
          setMsg('Plano criado.')
          setErro(null)
          carregar()
        }}
        onErro={setErro}
      />
    </div>
  )
}

function CartaoPlano({ plano, onSalvo, onErro }: { plano: PlanoComercial; onSalvo: () => void; onErro: (m: string) => void }) {
  const [nome, setNome] = useState(plano.name)
  const [ativo, setAtivo] = useState(plano.active)
  const [limites, setLimites] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.chave, paraTexto(plano.limits[c.chave] ?? null)]))
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
    <Panel
      title={
        <span className="inline-flex flex-wrap items-baseline gap-2">
          {plano.name}
          <span className="font-mono text-2xs font-normal text-faint">{plano.code}</span>
        </span>
      }
      actions={
        <>
          {!plano.active && <StatusTag>inativo</StatusTag>}
          <span className="text-xs text-muted">
            <span className="font-mono text-ink-2">{plano.empresas}</span> empresa(s)
          </span>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Nome do plano">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-xs font-medium text-muted">Limites (número inteiro ou &quot;ilimitado&quot;)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CAMPOS.map((c) => (
              <Field key={c.chave} label={c.rotulo}>
                <Input
                  value={limites[c.chave]}
                  onChange={(e) => setLimites({ ...limites, [c.chave]: e.target.value })}
                  className={cx('text-right', /^\d+$/.test(limites[c.chave].trim()) && 'font-mono')}
                />
              </Field>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox label="Plano ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <Button type="submit" variant="primary" size="sm" icon={Save}>
            Salvar
          </Button>
        </div>
      </form>
    </Panel>
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
        limits: { itensMonitorados: 3, usuarios: 1, analisesIaMes: 3, perguntasAoEditalMes: 10, mensagensDeSuporteMes: 30 },
      })
      setCode('')
      setNome('')
      onCriado()
    } catch (err) {
      onErro(err instanceof ApiRequestError ? err.message : 'Erro ao criar')
    }
  }

  return (
    <Panel
      title="Novo plano"
      description="Começa com limites baixos (3 itens monitorados, 1 usuário, 3 análises de IA por mês); ajuste depois no cartão do plano."
    >
      <form onSubmit={criar} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field label="Código" hint="Em maiúsculas, sem espaços." required>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ESPECIAL" spellCheck={false} className="font-mono uppercase" />
        </Field>
        <Field label="Nome" required>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Especial" />
        </Field>
        <Button type="submit" icon={Plus} className="sm:mt-[22px]">
          Criar plano
        </Button>
      </form>
    </Panel>
  )
}
