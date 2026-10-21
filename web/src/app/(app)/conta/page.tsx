'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, KeyRound, Trash2, UserX } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { clearSessionUser, replaceSessionToken } from '@/lib/session'
import UsoDoPlano from '@/components/UsoDoPlano'
import PainelDoAcesso from '@/components/PrazoDoAcesso'
import { Button, Carregando, Checkbox, Field, FormError, Input, Notice, PageHeader, Panel, Textarea, useDialogo } from '@/components/ui'

export default function ContaPage() {
  const user = useRequireSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha')
      return
    }
    if (newPassword.length < 10) {
      setError('A nova senha precisa ter pelo menos 10 caracteres')
      return
    }

    setSaving(true)
    try {
      const { token } = await api.post<{ token: string }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      })
      replaceSessionToken(token)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao trocar a senha')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <>
      <PageHeader title="Minha conta" description={user.email} />

      <div className="flex w-full max-w-xl flex-col gap-6">
        <PainelDoAcesso />
        <UsoDoPlano />

        <Panel title="Trocar senha">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Senha atual" required>
              <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 10 caracteres." required>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirmar nova senha" required>
              <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>

            <FormError>{error}</FormError>
            {success && <Notice tone="ok">Senha alterada com sucesso.</Notice>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" icon={KeyRound} loading={saving}>
                {saving ? 'Salvando…' : 'Salvar nova senha'}
              </Button>
            </div>
          </form>
        </Panel>

        <EmailsQueVoceRecebe />

        <SeusDados />
      </div>
    </>
  )
}

type TipoDeAviso = 'resumo-diario' | 'lembrete-de-prazo' | 'aviso-de-documento' | 'aviso-de-alteracao'

const AVISOS: { tipo: TipoDeAviso; rotulo: string; dica: string }[] = [
  { tipo: 'resumo-diario', rotulo: 'Resumo diário', dica: 'Às 7h, as licitações novas que combinam com os seus itens.' },
  { tipo: 'lembrete-de-prazo', rotulo: 'Lembrete de prazo', dica: 'Quando o prazo de uma licitação marcada como "Vou participar" está perto do fim.' },
  { tipo: 'aviso-de-documento', rotulo: 'Documento perto de vencer', dica: 'Para os documentos que você cadastrou no cofre da empresa.' },
  { tipo: 'aviso-de-alteracao', rotulo: 'Licitação alterada pelo órgão', dica: 'Quando muda o prazo, o valor ou o edital de uma licitação que você acompanha.' },
]

function EmailsQueVoceRecebe() {
  const [preferencias, setPreferencias] = useState<Record<TipoDeAviso, boolean> | null>(null)
  const [salvando, setSalvando] = useState<TipoDeAviso | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ preferencias: Record<TipoDeAviso, boolean> }>('/api/conta/preferencias-de-email')
      .then((r) => setPreferencias(r.preferencias))
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar as preferências'))
  }, [])

  async function alternar(tipo: TipoDeAviso, ligado: boolean) {
    setErro(null)
    setSalvando(tipo)
    try {
      const r = await api.patch<{ preferencias: Record<TipoDeAviso, boolean> }>('/api/conta/preferencias-de-email', { [tipo]: ligado })
      setPreferencias(r.preferencias)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível salvar a preferência')
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Panel
      title="E-mails que você recebe"
      description="Desligue os avisos que não quer receber. Os e-mails da conta (código de acesso, convite, senha e segurança) continuam chegando."
    >
      {!preferencias && !erro && <Carregando linhas={2} />}
      {preferencias && (
        <div className="flex flex-col gap-3">
          {AVISOS.map((aviso) => (
            <Checkbox
              key={aviso.tipo}
              label={aviso.rotulo}
              hint={aviso.dica}
              checked={preferencias[aviso.tipo]}
              disabled={salvando !== null}
              onChange={(e) => alternar(aviso.tipo, e.target.checked)}
            />
          ))}
        </div>
      )}
      <FormError>{erro}</FormError>
    </Panel>
  )
}

interface OpcoesDeExclusao {
  papel: 'OWNER' | 'MEMBER'
  podeExcluirSoOsMeusDados: boolean
  podePedirExclusaoDaEmpresa: boolean
}

type Exclusao = 'empresa' | 'meus-dados'

function SeusDados() {
  const { confirmar, avisar, dialogo } = useDialogo()
  const [opcoes, setOpcoes] = useState<OpcoesDeExclusao | null>(null)
  const [baixando, setBaixando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [senha, setSenha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [abrirExclusao, setAbrirExclusao] = useState<Exclusao | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const painelDeExclusao = useRef<HTMLFormElement>(null)

  useEffect(() => {
    api
      .get<OpcoesDeExclusao>('/api/conta/opcoes-de-exclusao')
      .then(setOpcoes)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar as opções de exclusão'))
  }, [])

  useEffect(() => {
    if (!abrirExclusao) return
    const painel = painelDeExclusao.current
    if (!painel) return
    painel.scrollIntoView({ behavior: 'smooth', block: 'center' })
    painel.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
  }, [abrirExclusao])

  async function baixar() {
    setBaixando(true)
    setErro(null)
    try {
      const dados = await api.get<unknown>('/api/conta/meus-dados')
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível gerar o arquivo')
    } finally {
      setBaixando(false)
    }
  }

  function abrir(exclusao: Exclusao) {
    setErro(null)
    setSenha('')
    setAbrirExclusao(exclusao)
  }

  async function pedirExclusaoDaEmpresa() {
    const confirmado = await confirmar({
      titulo: 'Pedir a exclusão definitiva?',
      mensagem: 'A exclusão apaga a empresa, todos os usuários e os dados cadastrados, e não pode ser desfeita.',
      confirmarRotulo: 'Pedir exclusão',
      perigo: true,
    })
    if (!confirmado) return
    const r = await api.post<{ mensagem: string }>('/api/conta/solicitar-exclusao', { senha, motivo: motivo.trim() || undefined })
    setMensagem(r.mensagem)
    setAbrirExclusao(null)
    setSenha('')
  }

  async function excluirMeusDados() {
    const confirmado = await confirmar({
      titulo: 'Excluir os seus dados agora?',
      mensagem:
        'Sua conta e seus dados pessoais são apagados na hora e você sai da plataforma. Os itens, documentos e estudos que você cadastrou continuam com a empresa. Não dá para desfazer.',
      confirmarRotulo: 'Excluir meus dados',
      perigo: true,
    })
    if (!confirmado) return
    const r = await api.post<{ mensagem: string }>('/api/conta/excluir-meus-dados', { senha })
    clearSessionUser()
    await avisar({ titulo: 'Dados excluídos', mensagem: r.mensagem, confirmarRotulo: 'Fechar' })
    window.location.href = '/'
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setExcluindo(true)
    try {
      if (abrirExclusao === 'empresa') await pedirExclusaoDaEmpresa()
      else await excluirMeusDados()
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível concluir o pedido')
    } finally {
      setExcluindo(false)
    }
  }

  const dono = opcoes?.papel === 'OWNER'

  return (
    <Panel
      title="Seus dados"
      description={
        dono
          ? 'Baixe uma cópia dos dados da sua conta e da empresa, ou peça a exclusão definitiva.'
          : 'Baixe uma cópia dos seus dados ou exclua os seus dados pessoais.'
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} loading={baixando} onClick={baixar}>
            {baixando ? 'Gerando…' : 'Baixar meus dados'}
          </Button>
          {opcoes && !abrirExclusao && opcoes.podeExcluirSoOsMeusDados && (
            <Button variant="danger" icon={UserX} onClick={() => abrir('meus-dados')}>
              {dono ? 'Excluir só os meus dados…' : 'Excluir meus dados…'}
            </Button>
          )}
          {opcoes && !abrirExclusao && opcoes.podePedirExclusaoDaEmpresa && (
            <Button variant="danger" icon={Trash2} onClick={() => abrir('empresa')}>
              Excluir conta e dados da empresa…
            </Button>
          )}
        </div>

        {abrirExclusao && (
          <form ref={painelDeExclusao} onSubmit={enviar} className="flex flex-col gap-4 rounded border border-danger-line p-4">
            {abrirExclusao === 'empresa' ? (
              <p className="text-sm text-ink-2">
                A exclusão apaga a empresa, todos os usuários e os dados cadastrados, e não pode ser desfeita. Só o dono da empresa pode pedir.
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                Apaga na hora a sua conta, as suas notificações e o seu e-mail dos registros de acesso. O que você cadastrou para a empresa (itens
                monitorados, documentos, estudos e planos) continua com ela, no nome {dono ? 'de outro dono' : 'do dono da empresa'}.
              </p>
            )}
            <Field label="Sua senha" required>
              <Input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            {abrirExclusao === 'empresa' && (
              <Field label="Motivo" hint="Opcional.">
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" icon={abrirExclusao === 'empresa' ? Trash2 : UserX} loading={excluindo}>
                {abrirExclusao === 'empresa' ? 'Pedir exclusão' : 'Excluir meus dados'}
              </Button>
              <Button variant="ghost" onClick={() => setAbrirExclusao(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {mensagem && <Notice tone="ok">{mensagem}</Notice>}
        <FormError>{erro}</FormError>
      </div>
      {dialogo}
    </Panel>
  )
}
