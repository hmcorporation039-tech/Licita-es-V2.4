'use client'

import { useCallback, useEffect, useState } from 'react'
import Captcha, { captchaAtivo } from '@/components/Captcha'
import ConfirmarCodigo from '@/components/ConfirmarCodigo'
import { PublicCard, type DestaqueDoPainel } from '@/components/PublicShell'
import { Button, Checkbox, cx, Field, FormError, Input, Notice, TextLink } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'
import { estadoDaSigla } from '@/lib/estados'
import type { Limites } from '@/lib/adminTypes'
import { resumoDosLimites } from '@/lib/planos'
import { guardarUtm, lerUtm, rastrear, type Utm } from '@/lib/rastreamento'
import InteresseDoCadastro, { type Interesse } from './InteresseDoCadastro'

const OPCOES_DE_TIPO = [
  { valor: 'PESSOA_JURIDICA', rotulo: 'Empresa (CNPJ)' },
  { valor: 'PESSOA_FISICA', rotulo: 'Pessoa física (CPF)' },
] as const

const TRIAL_DIAS_PADRAO = 7
const CHAVES_DE_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type InteresseInicial = Interesse

function utmParaEnvio(utm: Utm | null): Partial<Record<(typeof CHAVES_DE_UTM)[number], string>> | undefined {
  if (!utm) return undefined
  const envio: Partial<Record<(typeof CHAVES_DE_UTM)[number], string>> = {}
  for (const chave of CHAVES_DE_UTM) {
    const valor = utm[chave]
    if (typeof valor === 'string' && valor.trim()) envio[chave] = valor.trim().slice(0, 200)
  }
  return Object.keys(envio).length > 0 ? envio : undefined
}

function falaDaBela(interesse: Interesse | null): string {
  if (!interesse) return 'Me diga o que você vende. O resto eu procuro.'
  const estado = estadoDaSigla(interesse.uf)
  return `Confirmou o e-mail, eu começo a procurar ${interesse.termo} ${estado ? estado.local : 'em todo o Brasil'}.`
}

function destaquesDoPainel(abertas: number | null, trialDias: number | null, limitesDoTeste: Limites | null): DestaqueDoPainel[] {
  const dias = trialDias ?? TRIAL_DIAS_PADRAO
  const limites = resumoDosLimites(limitesDoTeste)
  const lista: DestaqueDoPainel[] = [
    { texto: <b>{dias} dias grátis, sem cartão</b>, detalhe: 'e sem compromisso' },
    { texto: 'No teste grátis', detalhe: limites ?? 'com limites de uso: veja os planos' },
  ]
  if (abertas) lista.push({ texto: <><b>{abertas.toLocaleString('pt-BR')}</b> licitações abertas agora</>, detalhe: 'nas fontes que a Bela acompanha' })
  return lista
}

export default function FormularioDeCadastro({
  interesseInicial,
  abertas,
  trialDias,
  limitesDoTeste,
}: {
  interesseInicial: InteresseInicial | null
  abertas: number | null
  trialDias: number | null
  limitesDoTeste: Limites | null
}) {
  const [interesse, setInteresse] = useState<Interesse | null>(interesseInicial)
  const [tipo, setTipo] = useState<'PESSOA_FISICA' | 'PESSOA_JURIDICA'>('PESSOA_JURIDICA')
  const [nome, setNome] = useState('')
  const [empresaNome, setEmpresaNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [aceite, setAceite] = useState(false)
  const [isca, setIsca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [conflito, setConflito] = useState<'EMAIL_JA_CADASTRADO' | 'DOCUMENTO_JA_CADASTRADO' | 'DOCUMENTO_PENDENTE' | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const aoReceberCaptcha = useCallback((t: string | null) => setCaptcha(t), [])

  useEffect(() => {
    guardarUtm()
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setConflito(null)
    if (senha !== confirmar) {
      setErro('A confirmação não bate com a senha')
      return
    }
    if (senha.length < 10) {
      setErro('A senha precisa ter pelo menos 10 caracteres')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post<{ mensagem: string }>('/api/auth/register', {
        nome,
        email,
        senha,
        tipo,
        documento,
        empresaNome: tipo === 'PESSOA_JURIDICA' && empresaNome.trim() ? empresaNome : undefined,
        telefone: telefone.trim() || undefined,
        aceiteTermos: aceite,
        website: isca || undefined,
        captcha: captcha ?? undefined,
        origem: utmParaEnvio(lerUtm()),
        interesse: interesse ? { termo: interesse.termo, uf: interesse.uf || undefined } : undefined,
      })
      rastrear('cadastro_enviado', { com_busca: Boolean(interesse), uf: interesse?.uf || undefined })
      setMensagem(r.mensagem)
    } catch (err) {
      if (err instanceof ApiRequestError && (err.code === 'EMAIL_JA_CADASTRADO' || err.code === 'DOCUMENTO_JA_CADASTRADO' || err.code === 'DOCUMENTO_PENDENTE')) {
        setConflito(err.code)
        return
      }
      setErro(err instanceof ApiRequestError ? err.message : 'Erro ao criar a conta')
    } finally {
      setEnviando(false)
    }
  }

  if (mensagem) {
    return <ConfirmarCodigo email={email} senha={senha} />
  }

  const rotuloDoDocumento = tipo === 'PESSOA_JURIDICA' ? 'CNPJ' : 'CPF'

  return (
    <PublicCard
      title="Criar conta"
      fala={falaDaBela(interesse)}
      destaques={destaquesDoPainel(abertas, trialDias, limitesDoTeste)}
      description={
        <>
          Teste gratuito, sem cartão. Um teste por CPF ou CNPJ. Já tem conta? <TextLink href="/login">Entrar</TextLink>.
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <InteresseDoCadastro interesse={interesse} onMudar={setInteresse} />

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted">Tipo de cadastro</legend>
          <div className="pb-segmento grid grid-cols-2 gap-px overflow-hidden rounded border border-line-strong bg-line-strong">
            {OPCOES_DE_TIPO.map((opcao) => {
              const marcado = tipo === opcao.valor
              return (
                <label
                  key={opcao.valor}
                  className={cx(
                    'flex h-10 cursor-pointer items-center justify-center gap-2 px-2 text-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
                    marcado ? 'bg-accent-soft font-semibold text-accent' : 'bg-surface text-ink-2 hover:bg-sunken',
                  )}
                >
                  <input type="radio" name="tipo" className="sr-only" checked={marcado} onChange={() => setTipo(opcao.valor)} />
                  {opcao.rotulo}
                </label>
              )
            })}
          </div>
        </fieldset>

        <Field label="Seu nome" required>
          <Input autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        </Field>
        {tipo === 'PESSOA_JURIDICA' && (
          <Field label="Nome da empresa" hint="Opcional">
            <Input autoComplete="organization" value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} maxLength={160} />
          </Field>
        )}
        <Field label={rotuloDoDocumento} required>
          <Input inputMode="numeric" className="font-mono" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={18} />
        </Field>
        <Field label="E-mail" required>
          <Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </Field>
        <Field label="Telefone" hint="Opcional">
          <Input type="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Senha" hint="Mínimo de 10 caracteres" required>
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={72} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar senha" required>
          <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} maxLength={72} autoComplete="new-password" />
        </Field>

        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
          <label>
            Não preencha
            <input tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
          </label>
        </div>

        <Checkbox
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          label={
            <>
              Li e aceito os{' '}
              <TextLink href="/termos" target="_blank">
                Termos de Uso
              </TextLink>{' '}
              e a{' '}
              <TextLink href="/privacidade" target="_blank">
                Política de Privacidade
              </TextLink>
              .
            </>
          }
        />

        <Captcha onToken={aoReceberCaptcha} />

        {conflito && (
          <Notice
            tone={conflito === 'DOCUMENTO_PENDENTE' ? 'warn' : 'danger'}
            title={
              conflito === 'EMAIL_JA_CADASTRADO'
                ? 'Este e-mail já está cadastrado.'
                : conflito === 'DOCUMENTO_JA_CADASTRADO'
                  ? `Esta empresa já tem cadastro para este ${rotuloDoDocumento}.`
                  : `Já existe um cadastro aguardando confirmação para este ${rotuloDoDocumento}.`
            }
          >
            <p className="mt-1">Para acessar, siga uma destas opções:</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-faint">
              {conflito === 'DOCUMENTO_PENDENTE' ? (
                <li>
                  <TextLink href="/verificar-email">Digitar o código de confirmação</TextLink> (enviado ao e-mail usado nesse cadastro)
                </li>
              ) : (
                <>
                  <li>
                    <TextLink href="/login">Entrar na sua conta</TextLink>
                  </li>
                  <li>
                    <TextLink href="/esqueci-senha">Recuperar o acesso (esqueci minha senha)</TextLink>
                  </li>
                </>
              )}
              {conflito === 'DOCUMENTO_JA_CADASTRADO' && <li>Se você é de outra equipe da mesma empresa, peça ao responsável pela conta para convidar você (Empresa → Membros).</li>}
            </ul>
            <p className="mt-2 text-xs text-muted">
              {conflito === 'EMAIL_JA_CADASTRADO'
                ? 'Enviamos também um aviso para esse e-mail. Se for outro endereço, corrija-o acima.'
                : 'Por segurança, mostramos só parte do e-mail do cadastro; o responsável pela conta recebeu um aviso.'}
            </p>
          </Notice>
        )}
        <FormError>{erro}</FormError>
        <Button type="submit" variant="primary" loading={enviando} disabled={!aceite || (captchaAtivo && !captcha)} className="pb-cta w-full">
          {enviando ? 'Criando…' : 'Criar conta e começar o teste'}
        </Button>
      </form>
    </PublicCard>
  )
}
