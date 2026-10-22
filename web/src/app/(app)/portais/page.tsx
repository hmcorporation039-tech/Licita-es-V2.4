'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import {
  Button,
  Carregando,
  EmptyState,
  Field,
  FormError,
  Input,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  useDialogo,
  type Tom,
} from '@/components/ui'

type Portal = {
  id: string
  nome: string
  hosts: string[]
  loginComCaptcha: boolean
  automacao: 'confirmar' | 'permitida' | 'vedada'
  observacao?: string
}

type Credencial = {
  id: string
  portal: string
  login: string
  temConsentimento: boolean
  ultimoTesteEm: string | null
  ultimoTesteOk: boolean | null
  atualizadoEm: string
}

const TERMO =
  'Autorizo a Licita Bela a guardar, de forma criptografada, o acesso deste portal e a usá-lo em meu nome para acompanhar e disputar licitações. Entendo que posso excluir este acesso quando quiser.'
const TERMO_VERSAO = 'v1'

function statusDoTeste(c: Credencial): { rotulo: string; tom: Tom } {
  if (c.ultimoTesteOk === true) return { rotulo: 'Conexão ok', tom: 'neutral' }
  if (c.ultimoTesteOk === false) return { rotulo: 'Falhou no teste', tom: 'danger' }
  return { rotulo: 'Ainda não testado', tom: 'warn' }
}

export default function PortaisPage() {
  const user = useRequireSession()
  const { confirmar, dialogo } = useDialogo()

  const [portais, setPortais] = useState<Portal[]>([])
  const [credenciais, setCredenciais] = useState<Credencial[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [portal, setPortal] = useState('')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [aceite, setAceite] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroDoForm, setErroDoForm] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const dados = await api.get<{ portais: Portal[]; credenciais: Credencial[] }>('/api/meus-portais')
      setPortais(dados.portais)
      setCredenciais(dados.credenciais)
      if (!portal && dados.portais[0]) setPortal(dados.portais[0].id)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar seus portais.')
    } finally {
      setCarregando(false)
    }
  }, [portal])

  useEffect(() => {
    if (user) void carregar()
  }, [user, carregar])

  if (!user) return <Carregando linhas={6} />

  const portalSelecionado = portais.find((p) => p.id === portal)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroDoForm(null)
    if (!portal || !login.trim() || !senha) {
      setErroDoForm('Preencha o portal, o login e a senha.')
      return
    }
    if (!aceite) {
      setErroDoForm('É preciso aceitar o termo de autorização.')
      return
    }
    setSalvando(true)
    try {
      await api.post('/api/meus-portais', {
        portal,
        login: login.trim(),
        senha,
        aceiteDoTermo: true,
        consentimentoTexto: `${TERMO} (${TERMO_VERSAO})`,
      })
      setLogin('')
      setSenha('')
      setAceite(false)
      await carregar()
    } catch (e) {
      setErroDoForm(e instanceof ApiRequestError ? e.message : 'Não foi possível salvar agora.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(c: Credencial) {
    const nome = portais.find((p) => p.id === c.portal)?.nome ?? c.portal
    if (!(await confirmar({ titulo: `Excluir o acesso ao ${nome}?`, mensagem: 'A senha guardada é apagada. Você pode cadastrar de novo depois.', confirmarRotulo: 'Excluir', perigo: true }))) return
    try {
      await api.delete(`/api/meus-portais/${c.id}`)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível excluir agora.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Meus Portais" description="Cadastre o acesso aos portais onde sua empresa já tem inscrição. A senha é guardada criptografada e usada só em seu nome." />

      {erro && <Notice tone="danger">{erro}</Notice>}

      <Notice tone="info">
        Para disputar, sua empresa precisa ter cadastro próprio em cada portal. Aqui você só registra o acesso para a Bela acompanhar. Onde o portal pede CAPTCHA ou não permite robô, a Bela sugere o lance e você confirma.
      </Notice>

      <Panel title="Adicionar acesso" description="O acesso fica criptografado; a senha nunca aparece de volta na tela.">
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Portal">
              <Select value={portal} onChange={(e) => setPortal(e.target.value)}>
                {portais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Login no portal" hint="O usuário/CNPJ que você usa para entrar.">
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <Field label="Senha do portal">
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
          </Field>
          {portalSelecionado?.loginComCaptcha && (
            <p className="text-sm text-muted">
              O {portalSelecionado.nome} costuma pedir CAPTCHA/gov.br no login. A Bela não burla isso: ela acompanha a disputa e sugere o lance, e você confirma.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>{TERMO}</span>
          </label>
          <FormError>{erroDoForm}</FormError>
          <Button type="submit" variant="primary" icon={KeyRound} loading={salvando} className="self-start">
            Salvar acesso
          </Button>
        </form>
      </Panel>

      <Panel title="Acessos cadastrados">
        {carregando ? (
          <Carregando linhas={3} />
        ) : credenciais.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Nenhum acesso cadastrado" description="Adicione o acesso de um portal acima para a Bela começar a acompanhar." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>Portal</Th>
                  <Th>Login</Th>
                  <Th>Consentimento</Th>
                  <Th>Conexão</Th>
                  <Th> </Th>
                </Tr>
              </THead>
              <tbody>
                {credenciais.map((c) => {
                  const st = statusDoTeste(c)
                  return (
                    <Tr key={c.id}>
                      <Td>{portais.find((p) => p.id === c.portal)?.nome ?? c.portal}</Td>
                      <Td className="font-mono">{c.login}</Td>
                      <Td>{c.temConsentimento ? <StatusTag tone="neutral">Autorizado</StatusTag> : <StatusTag tone="warn">Pendente</StatusTag>}</Td>
                      <Td>
                        <StatusTag tone={st.tom}>{st.rotulo}</StatusTag>
                      </Td>
                      <Td>
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void excluir(c)} aria-label={`Excluir acesso ao ${c.portal}`} />
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      {dialogo}
    </div>
  )
}
