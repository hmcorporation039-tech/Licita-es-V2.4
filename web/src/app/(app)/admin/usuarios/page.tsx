'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, KeyRound, MailCheck, Power, UserPlus } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { AdminUser } from '@/lib/types'
import type { PlanoComercial } from '@/lib/adminTypes'
import { AdminCabecalho } from '@/components/AdminShell'
import {
  Button,
  Carregando,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Notice,
  Panel,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  THead,
  Th,
  Tr,
} from '@/components/ui'

function formatData(v: string | null) {
  if (!v) return 'sem prazo'
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isExpired(v: string | null) {
  return v != null && new Date(v).getTime() < Date.now()
}

const SENHA_MIN = 10
const SENHA_MAX = 72

function Situacao({ u }: { u: AdminUser }) {
  if (!u.active) return <StatusTag tone="danger">Desativado</StatusTag>
  if (isExpired(u.accessExpiresAt)) return <StatusTag tone="warn">Acesso expirado</StatusTag>
  return <StatusTag>Ativo</StatusTag>
}

export default function AdminUsuariosPage() {
  const user = useRequireSession()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdminField, setIsAdminField] = useState(false)
  const [diasValidade, setDiasValidade] = useState('')
  const [planos, setPlanos] = useState<PlanoComercial[]>([])
  const [planCode, setPlanCode] = useState('TESTE')
  const [creating, setCreating] = useState(false)
  const [generatedInfo, setGeneratedInfo] = useState<string | null>(null)

  const [passwordEditId, setPasswordEditId] = useState<string | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [senhaMsg, setSenhaMsg] = useState<{ id: string; tipo: 'erro' | 'ok'; texto: string } | null>(null)

  useEffect(() => {
    if (!user) return
    if (!user.isAdmin) {
      router.replace('/dashboard')
      return
    }
    load()
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const [data, pl] = await Promise.all([
        api.get<AdminUser[]>('/api/admin/users'),
        api.get<PlanoComercial[]>('/api/admin/plans'),
      ])
      setUsers(data)
      setPlanos(pl.filter((p) => p.active))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGeneratedInfo(null)
    setCreating(true)
    try {
      const result = await api.post<{ generatedPassword?: string; email: string }>('/api/admin/users', {
        email,
        name: name || undefined,
        password: password || undefined,
        isAdmin: isAdminField,
        diasValidade: diasValidade ? Number(diasValidade) : null,
        planCode,
      })
      if (result.generatedPassword) {
        setGeneratedInfo(`Senha gerada para ${result.email}: ${result.generatedPassword} (repasse com segurança — não fica salva em nenhum outro lugar)`)
      }
      setEmail('')
      setName('')
      setPassword('')
      setIsAdminField(false)
      setDiasValidade('')
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(u: AdminUser) {
    await api.patch(`/api/admin/users/${u.id}`, { active: !u.active })
    await load()
  }

  async function confirmarEmail(u: AdminUser) {
    await api.patch(`/api/admin/users/${u.id}`, { emailConfirmado: true })
    await load()
  }

  async function extend(u: AdminUser, dias: number | null) {
    await api.patch(`/api/admin/users/${u.id}`, { diasValidade: dias })
    await load()
  }

  async function resetPassword(u: AdminUser) {
    setError(null)
    setGeneratedInfo(null)
    setSenhaMsg(null)
    if (passwordValue && passwordValue.length < SENHA_MIN) {
      setSenhaMsg({ id: u.id, tipo: 'erro', texto: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres (você digitou ${passwordValue.length}).` })
      return
    }
    if (passwordValue.length > SENHA_MAX) {
      setSenhaMsg({ id: u.id, tipo: 'erro', texto: `A senha pode ter no máximo ${SENHA_MAX} caracteres.` })
      return
    }
    setPasswordSaving(true)
    try {
      const result = await api.post<{ generatedPassword?: string }>(`/api/admin/users/${u.id}/reset-password`, {
        password: passwordValue || undefined,
      })
      const aviso = result.generatedPassword
        ? `Nova senha gerada para ${u.email}: ${result.generatedPassword} (repasse com segurança — não fica salva em nenhum outro lugar)`
        : `Senha de ${u.email} atualizada. As sessões abertas dessa conta foram encerradas.`
      setGeneratedInfo(aviso)
      setSenhaMsg({ id: u.id, tipo: 'ok', texto: aviso })
      setPasswordEditId(null)
      setPasswordValue('')
      await load()
    } catch (err) {
      setSenhaMsg({ id: u.id, tipo: 'erro', texto: err instanceof ApiRequestError ? err.message : 'Erro ao trocar a senha' })
    } finally {
      setPasswordSaving(false)
    }
  }

  if (!user || !user.isAdmin) return null

  const falhouAoCarregar = Boolean(error) && !loading && users.length === 0

  return (
    <>
      <AdminCabecalho titulo="Usuários" />

      <Panel title="Criar usuário" description="A empresa do usuário é criada junto, no plano escolhido.">
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="E-mail" required>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Nome" hint="Opcional.">
            <Input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Senha" hint="Opcional. Se ficar vazia, o sistema gera uma.">
            <Input autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Dias de acesso" hint="Vazio = sem prazo.">
            <Input type="number" min={1} inputMode="numeric" value={diasValidade} onChange={(e) => setDiasValidade(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Plano da empresa">
            <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              {planos.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-2.5">
            <Checkbox label="Também é administrador" checked={isAdminField} onChange={(e) => setIsAdminField(e.target.checked)} />
          </div>

          {!falhouAoCarregar && <FormError className="sm:col-span-2">{error}</FormError>}
          {generatedInfo && generatedInfo !== senhaMsg?.texto && (
            <Notice tone="ok" className="sm:col-span-2">
              <span className="break-all">{generatedInfo}</span>
            </Notice>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" icon={UserPlus} loading={creating}>
              {creating ? 'Criando…' : 'Criar usuário'}
            </Button>
          </div>
        </form>
      </Panel>

      <section aria-labelledby="usuarios-lista" className="flex min-w-0 flex-col gap-2.5">
        <h2 id="usuarios-lista" className="text-sm font-semibold text-ink">
          Usuários cadastrados
          {users.length > 0 && <span className="ml-1.5 font-mono text-xs font-normal text-muted">{users.length}</span>}
        </h2>

        {loading && users.length === 0 ? (
          <Carregando linhas={6} />
        ) : falhouAoCarregar ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null)
              load()
            }}
          />
        ) : users.length === 0 ? (
          <EmptyState title="Nenhum usuário cadastrado." description="Use o formulário acima para criar o primeiro acesso." />
        ) : (
          <TableWrap minWidth={1080}>
            <Table aria-busy={loading || undefined}>
              <THead>
                <tr>
                  <Th>Usuário</Th>
                  <Th>Situação</Th>
                  <Th>Pendências</Th>
                  <Th align="right">Acesso até</Th>
                  <Th align="right">Ações</Th>
                </tr>
              </THead>
              <tbody>
                {users.map((u) => {
                  const editando = passwordEditId === u.id
                  const msgDaLinha = senhaMsg?.id === u.id ? senhaMsg : null
                  const formId = `senha-${u.id}`
                  return (
                    <Fragment key={u.id}>
                      <Tr selected={editando}>
                        <Td>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs text-ink">{u.email}</span>
                              {u.isAdmin && <StatusTag mono>admin</StatusTag>}
                            </span>
                            <span className="text-xs text-muted">{u.name ?? 'sem nome'}</span>
                          </div>
                        </Td>
                        <Td>
                          <Situacao u={u} />
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            {!u.emailConfirmado && <StatusTag>e-mail não confirmado</StatusTag>}
                            {!u.hasPassword && <StatusTag>sem senha definida</StatusTag>}
                            {u.emailConfirmado && u.hasPassword && <span className="text-muted">—</span>}
                          </div>
                        </Td>
                        <Td numeric muted>
                          {formatData(u.accessExpiresAt)}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap justify-end gap-1">
                            {!u.emailConfirmado && (
                              <Button size="sm" variant="secondary" icon={MailCheck} onClick={() => confirmarEmail(u)}>
                                Confirmar e-mail
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" icon={CalendarPlus} onClick={() => extend(u, 30)}>
                              +30 dias
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => extend(u, null)}>
                              Remover prazo
                            </Button>
                            <Button size="sm" variant="ghost" icon={Power} onClick={() => toggleActive(u)}>
                              {u.active ? 'Desativar' : 'Ativar'}
                            </Button>
                            <Button
                              size="sm"
                              variant={editando ? 'secondary' : 'ghost'}
                              icon={KeyRound}
                              aria-expanded={editando}
                              aria-controls={editando ? formId : undefined}
                              onClick={() => {
                                setSenhaMsg(null)
                                setPasswordEditId(passwordEditId === u.id ? null : u.id)
                                setPasswordValue('')
                              }}
                            >
                              Trocar senha
                            </Button>
                          </div>
                        </Td>
                      </Tr>

                      {editando && (
                        <Tr selected>
                          <Td colSpan={5}>
                            <div id={formId} className="flex flex-wrap items-start gap-3">
                              <Field
                                label={`Nova senha para ${u.email}`}
                                hint={
                                  passwordValue
                                    ? `${passwordValue.length}/${SENHA_MIN} caracteres${passwordValue.length < SENHA_MIN ? ' — ainda curta' : ''}`
                                    : `Mínimo ${SENHA_MIN} caracteres. Deixe vazio para gerar automaticamente.`
                                }
                                error={msgDaLinha?.tipo === 'erro' ? <span role="alert">{msgDaLinha.texto}</span> : undefined}
                                className="w-full max-w-md"
                              >
                                <Input
                                  type="text"
                                  autoComplete="off"
                                  spellCheck={false}
                                  value={passwordValue}
                                  onChange={(e) => setPasswordValue(e.target.value)}
                                  className="font-mono"
                                  autoFocus
                                />
                              </Field>
                              <div className="flex gap-2 pt-[22px]">
                                <Button variant="primary" loading={passwordSaving} onClick={() => resetPassword(u)}>
                                  {passwordSaving ? 'Salvando…' : 'Confirmar'}
                                </Button>
                                <Button variant="ghost" onClick={() => setPasswordEditId(null)}>
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          </Td>
                        </Tr>
                      )}

                      {!editando && msgDaLinha && (
                        <Tr>
                          <Td colSpan={5}>
                            <Notice tone={msgDaLinha.tipo === 'erro' ? 'danger' : 'ok'}>
                              <span className="break-all">{msgDaLinha.texto}</span>
                            </Notice>
                          </Td>
                        </Tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>
    </>
  )
}
