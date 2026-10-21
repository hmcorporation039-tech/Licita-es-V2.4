'use client'

import { formatarData } from '@/lib/datas'
import { Fragment, useEffect, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, Copy, Eye, EyeOff, KeyRound, MailCheck, Power, UserPlus } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { getSessionUser } from '@/lib/session'
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
  cx,
} from '@/components/ui'

function isExpired(v: string | null) {
  return v != null && new Date(v).getTime() < Date.now()
}

function diasRestantes(v: string): number {
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000)
}

const SENHA_MIN = 10
const SENHA_MAX = 72

type MensagemDeSenha = { id: string; tipo: 'erro' | 'ok'; texto: string; senhaGerada?: string }

function SenhaComAlternancia({ className, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <Input {...rest} type={visivel ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} className={cx('pr-10 font-mono', className)} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded text-muted hover:text-ink"
      >
        {visivel ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  )
}

function SenhaGerada({ titulo, email, senha }: { titulo: string; email: string; senha: string }) {
  const [copia, setCopia] = useState<'nada' | 'ok' | 'falhou'>('nada')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha)
      setCopia('ok')
    } catch {
      setCopia('falhou')
    }
  }

  return (
    <Notice
      tone="ok"
      title={`${titulo} ${email}`}
      action={
        <Button size="sm" variant="secondary" icon={copia === 'ok' ? Check : Copy} onClick={copiar}>
          {copia === 'ok' ? 'Copiada' : 'Copiar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <code className="break-all font-mono text-sm text-ink">{senha}</code>
        <span className="text-xs">
          {copia === 'falhou' && 'Não deu para copiar automaticamente: selecione a senha e copie. '}
          Repasse com segurança: ela não fica salva em nenhum outro lugar.
        </span>
      </div>
    </Notice>
  )
}

function emTeste(u: AdminUser): boolean {
  return u.planCode === 'TESTE' && !u.isAdmin
}

function Situacao({ u }: { u: AdminUser }) {
  if (!u.active) return <StatusTag tone="danger">Desativado</StatusTag>
  if (u.isAdmin) return <StatusTag>Equipe</StatusTag>
  if (isExpired(u.accessExpiresAt)) return <StatusTag tone="warn">{u.planCode === 'TESTE' ? 'Teste encerrado' : 'Acesso expirado'}</StatusTag>
  if (emTeste(u) && u.accessExpiresAt === null) return <StatusTag tone="warn">Teste sem prazo</StatusTag>
  return <StatusTag>{u.planCode === 'TESTE' ? 'Em teste' : 'Ativo'}</StatusTag>
}

function AcoesDePrazo({ u, onPrazo }: { u: AdminUser; onPrazo: (u: AdminUser, dias: number | null) => void }) {
  if (u.isAdmin || !u.active) return null
  const semPrazo = u.accessExpiresAt === null
  if (emTeste(u)) {
    return (
      <Button size="sm" variant={semPrazo ? 'secondary' : 'ghost'} icon={CalendarPlus} title="Acesso até hoje + 14 dias" onClick={() => onPrazo(u, 14)}>
        {semPrazo ? 'Definir prazo de 14 dias' : isExpired(u.accessExpiresAt) ? 'Reabrir teste por 14 dias' : 'Estender teste'}
      </Button>
    )
  }
  return (
    <>
      <Button size="sm" variant="ghost" icon={CalendarPlus} title="Acesso até hoje + 30 dias" onClick={() => onPrazo(u, 30)}>
        Renovar 30 dias
      </Button>
      {!semPrazo && (
        <Button size="sm" variant="ghost" onClick={() => onPrazo(u, null)}>
          Remover prazo
        </Button>
      )}
    </>
  )
}

export default function AdminUsuariosPage() {
  const user = useRequireSession()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdminField, setIsAdminField] = useState(false)
  const [diasValidade, setDiasValidade] = useState('')
  const [planos, setPlanos] = useState<PlanoComercial[]>([])
  const [planCode, setPlanCode] = useState('TESTE')
  const [creating, setCreating] = useState(false)
  const [senhaCriada, setSenhaCriada] = useState<{ email: string; senha: string } | null>(null)
  const [conviteEnviadoPara, setConviteEnviadoPara] = useState<string | null>(null)

  const [passwordEditId, setPasswordEditId] = useState<string | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [senhaMsg, setSenhaMsg] = useState<MensagemDeSenha | null>(null)

  useEffect(() => {
    if (!user) return
    if (!user.isAdmin) {
      router.replace('/dashboard')
      return
    }
    setMeuId(getSessionUser()?.id ?? user.id)
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
    setSenhaCriada(null)
    setCreating(true)
    try {
      setConviteEnviadoPara(null)
      const result = await api.post<{ generatedPassword?: string; email: string; conviteEnviado?: boolean }>('/api/admin/users', {
        email,
        name: name || undefined,
        password: password || undefined,
        isAdmin: isAdminField,
        diasValidade: diasValidade ? Number(diasValidade) : null,
        planCode,
      })
      if (result.conviteEnviado) setConviteEnviadoPara(result.email)
      if (result.generatedPassword) setSenhaCriada({ email: result.email, senha: result.generatedPassword })
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
      setSenhaMsg({
        id: u.id,
        tipo: 'ok',
        texto: `Senha de ${u.email} atualizada. As sessões abertas dessa conta foram encerradas.`,
        senhaGerada: result.generatedPassword,
      })
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
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Nome" hint="Opcional.">
            <Input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Senha" hint="Opcional. Se ficar vazia, o sistema gera uma.">
            <SenhaComAlternancia value={password} onChange={(e) => setPassword(e.target.value)} />
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
          {conviteEnviadoPara && (
            <div className="sm:col-span-2">
              <Notice tone="ok" title={`Convite enviado para ${conviteEnviadoPara}`}>
                A pessoa recebe o login e um link para criar a própria senha, válido por 72 horas.
              </Notice>
            </div>
          )}
          {senhaCriada && (
            <div className="sm:col-span-2">
              <SenhaGerada titulo="Senha gerada para" email={senhaCriada.email} senha={senhaCriada.senha} />
            </div>
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
                  const souEu = meuId !== null && u.id === meuId
                  const semPrazo = u.accessExpiresAt === null
                  const restantes = u.accessExpiresAt && !isExpired(u.accessExpiresAt) ? diasRestantes(u.accessExpiresAt) : null
                  return (
                    <Fragment key={u.id}>
                      <Tr selected={editando}>
                        <Td>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm text-ink">{u.email}</span>
                              {u.isAdmin && <StatusTag>Admin</StatusTag>}
                              {souEu && <StatusTag tone="accent">Você</StatusTag>}
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
                          {semPrazo ? (
                            <span className="font-sans">sem prazo</span>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{formatarData(u.accessExpiresAt)}</span>
                              {restantes !== null && (
                                <span className="font-sans text-xs">{restantes === 1 ? 'falta 1 dia' : `faltam ${restantes} dias`}</span>
                              )}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap justify-end gap-1">
                            {!u.emailConfirmado && (
                              <Button size="sm" variant="secondary" icon={MailCheck} onClick={() => confirmarEmail(u)}>
                                Confirmar e-mail
                              </Button>
                            )}
                            <AcoesDePrazo u={u} onPrazo={extend} />
                            {!souEu && (
                              <Button size="sm" variant="ghost" icon={Power} onClick={() => toggleActive(u)}>
                                {u.active ? 'Desativar' : 'Ativar'}
                              </Button>
                            )}
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
                                <SenhaComAlternancia value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} autoFocus />
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
                            {msgDaLinha.senhaGerada ? (
                              <SenhaGerada titulo="Nova senha gerada para" email={u.email} senha={msgDaLinha.senhaGerada} />
                            ) : (
                              <Notice tone={msgDaLinha.tipo === 'erro' ? 'danger' : 'ok'}>
                                <span className="break-all">{msgDaLinha.texto}</span>
                              </Notice>
                            )}
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
