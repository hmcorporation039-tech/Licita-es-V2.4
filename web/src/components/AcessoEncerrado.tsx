'use client'

import { useState } from 'react'
import { Download, MessageCircle, Send } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { linkDoWhatsAppParaContinuar, numeroDoWhatsApp, situacaoDoAcesso } from '@/lib/acessoDaConta'
import { Button, Field, FormError, Input, Notice, buttonClasses } from '@/components/ui'

type Pedido = 'continuar' | 'exportar'

export interface DadosDoAcessoEncerrado {
  acessoAte?: string | null
  emTeste?: boolean
}

export function lerDadosDoAcessoEncerrado(detalhes: Record<string, unknown>): DadosDoAcessoEncerrado {
  return {
    acessoAte: typeof detalhes.acessoAte === 'string' ? detalhes.acessoAte : null,
    emTeste: detalhes.emTeste === true,
  }
}

export default function AcessoEncerrado({
  dados = {},
  emailInicial = '',
  senhaInicial = '',
  onVoltar,
}: {
  dados?: DadosDoAcessoEncerrado
  emailInicial?: string
  senhaInicial?: string
  onVoltar?: () => void
}) {
  const [email, setEmail] = useState(emailInicial)
  const [senha, setSenha] = useState(senhaInicial)
  const [enviando, setEnviando] = useState<Pedido | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const situacao = situacaoDoAcesso(dados.acessoAte, dados.emTeste === true)
  const whatsapp = numeroDoWhatsApp()
  const pedirCredenciais = !emailInicial || !senhaInicial

  async function pedir(pedido: Pedido) {
    setErro(null)
    setMensagem(null)
    if (!email.trim() || !senha) {
      setErro('Informe o e-mail e a senha da conta para registrar o pedido.')
      return
    }
    setEnviando(pedido)
    try {
      const r = await api.post<{ mensagem: string }>('/api/auth/acesso-encerrado/pedido', { email: email.trim(), password: senha, pedido })
      setMensagem(r.mensagem)
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível registrar o pedido. Tente de novo.')
    } finally {
      setEnviando(null)
    }
  }

  const terminou = situacao ? ` em ${situacao.dataCompleta}` : ''

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1.5" aria-labelledby="acesso-encerrado-o-que-houve">
        <h2 id="acesso-encerrado-o-que-houve" className="text-base font-bold text-ink">
          O que aconteceu
        </h2>
        <p className="text-sm text-ink-2">
          {dados.emTeste ? `O seu teste grátis terminou${terminou}.` : `O prazo de acesso da sua conta terminou${terminou}.`} Por isso o login está bloqueado. Nada foi
          apagado: itens monitorados, documentos, licitações escolhidas e estudos continuam guardados.
        </p>
      </section>

      {pedirCredenciais && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">Para pedir pelo site, confirme o e-mail e a senha da conta.</p>
          <Field label="E-mail" required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha" required>
            <Input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Field>
        </div>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="acesso-encerrado-continuar">
        <h2 id="acesso-encerrado-continuar" className="text-base font-bold text-ink">
          Como continuar usando
        </h2>
        <p className="text-sm text-ink-2">Fale com a equipe da Licita Bela para assinar um plano. O acesso volta com tudo como estava.</p>
        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <a
              href={linkDoWhatsAppParaContinuar(whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses('primary')}
            >
              <MessageCircle size={16} aria-hidden />
              Falar pelo WhatsApp
            </a>
          )}
          <Button variant={whatsapp ? 'secondary' : 'primary'} icon={Send} loading={enviando === 'continuar'} onClick={() => pedir('continuar')}>
            Quero continuar: peça contato
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="acesso-encerrado-dados">
        <h2 id="acesso-encerrado-dados" className="text-base font-bold text-ink">
          Cópia dos seus dados
        </h2>
        <p className="text-sm text-ink-2">
          Você tem direito a receber uma cópia dos dados da conta e da empresa (LGPD, art. 18). A equipe envia o arquivo para o e-mail da conta em até 15 dias.
        </p>
        <div>
          <Button variant="secondary" icon={Download} loading={enviando === 'exportar'} onClick={() => pedir('exportar')}>
            Pedir a cópia dos meus dados
          </Button>
        </div>
      </section>

      {mensagem && <Notice tone="ok">{mensagem}</Notice>}
      <FormError>{erro}</FormError>

      {onVoltar && (
        <button type="button" onClick={onVoltar} className="self-start text-sm font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent">
          Entrar com outra conta
        </button>
      )}
    </div>
  )
}
