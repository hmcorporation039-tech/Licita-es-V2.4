'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import Captcha, { captchaAtivo } from '@/components/Captcha'
import PublicShell from '@/components/PublicShell'
import { api, ApiRequestError } from '@/lib/api'

export default function CadastroPage() {
  const [tipo, setTipo] = useState<'PESSOA_FISICA' | 'PESSOA_JURIDICA'>('PESSOA_JURIDICA')
  const [nome, setNome] = useState('')
  const [empresaNome, setEmpresaNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [aceite, setAceite] = useState(false)
  const [isca, setIsca] = useState('') // campo invisível: só robôs preenchem
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const aoReceberCaptcha = useCallback((t: string | null) => setCaptcha(t), [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
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
      })
      setMensagem(r.mensagem)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Erro ao criar a conta')
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'rounded border border-slate-300 px-3 py-2 text-sm'

  if (mensagem) {
    return (
      <PublicShell estreito>
        <h1 className="mb-2 text-2xl font-semibold">Verifique seu e-mail</h1>
        <p className="text-sm text-slate-600">{mensagem}</p>
        <p className="mt-3 text-sm text-slate-500">
          Não chegou? Veja a caixa de spam e, se precisar, peça um novo link na{' '}
          <Link href="/login" className="text-indigo-700 hover:underline">
            tela de entrada
          </Link>
          .
        </p>
      </PublicShell>
    )
  }

  return (
    <PublicShell estreito>
      <h1 className="mb-1 text-2xl font-semibold">Criar conta</h1>
      <p className="mb-5 text-sm text-slate-500">
        Teste gratuito, sem cartão. Um teste por CPF ou CNPJ. Já tem conta?{' '}
        <Link href="/login" className="text-indigo-700 hover:underline">
          Entrar
        </Link>
        .
      </p>

      <form onSubmit={enviar} className="flex flex-col gap-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={tipo === 'PESSOA_JURIDICA'} onChange={() => setTipo('PESSOA_JURIDICA')} /> Empresa (CNPJ)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={tipo === 'PESSOA_FISICA'} onChange={() => setTipo('PESSOA_FISICA')} /> Pessoa física (CPF)
          </label>
        </div>

        <input required placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} maxLength={120} />
        {tipo === 'PESSOA_JURIDICA' && (
          <input placeholder="Nome da empresa" value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} className={campo} maxLength={160} />
        )}
        <input
          required
          inputMode="numeric"
          placeholder={tipo === 'PESSOA_JURIDICA' ? 'CNPJ' : 'CPF'}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          className={campo}
          maxLength={18}
        />
        <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} maxLength={254} />
        <input placeholder="Telefone (opcional)" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={campo} maxLength={30} />
        <input required type="password" placeholder="Senha (mínimo 10 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} maxLength={72} autoComplete="new-password" />
        <input required type="password" placeholder="Confirmar senha" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={campo} maxLength={72} autoComplete="new-password" />

        {/* Isca anti-robô: fora da tela e fora da ordem de tabulação. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
          <label>
            Não preencha
            <input tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1" />
          <span>
            Li e aceito os{' '}
            <Link href="/termos" target="_blank" className="text-indigo-700 hover:underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" target="_blank" className="text-indigo-700 hover:underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        <Captcha onToken={aoReceberCaptcha} />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button
          type="submit"
          disabled={enviando || !aceite || (captchaAtivo && !captcha)}
          className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {enviando ? 'Criando...' : 'Criar conta e começar o teste'}
        </button>
      </form>
    </PublicShell>
  )
}
