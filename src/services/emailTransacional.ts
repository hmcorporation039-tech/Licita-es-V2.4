// ============================================================
// services/emailTransacional.ts — E-mails de conta: confirmação de cadastro,
// recuperação de senha e aviso de tentativa de cadastro repetido.
//
// - Em teste (NODE_ENV=test) nada sai: as mensagens ficam em `caixaDeSaidaDeTeste`.
// - Sem RESEND_API_KEY nada sai e o motivo vai para o log. O link só é impresso
//   fora de produção (para testar localmente); em produção um link no log seria
//   uma credencial vazada.
// - O envio NUNCA lança: quem chama não pode revelar (por erro ou por demora)
//   se um e-mail existe na base.
// ============================================================

import { Resend } from 'resend'
import { appUrl } from '../lib/appUrl'
import { escapeHtml } from '../lib/html'

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@seudominio.com.br'

export interface EmailEnviado {
  to: string
  subject: string
  html: string
  link?: string
  // Código de confirmação (só aparece na caixa de saída de teste; nunca vai para o log).
  codigo?: string
}
export const caixaDeSaidaDeTeste: EmailEnviado[] = []

let resend: Resend | null = null

async function enviar(msg: EmailEnviado): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'test') {
      caixaDeSaidaDeTeste.push(msg)
      return
    }
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        `[E-mail] RESEND_API_KEY não configurada — "${msg.subject}" não foi enviado.` +
          (process.env.NODE_ENV !== 'production' && msg.link ? ` Link (somente dev): ${msg.link}` : '') +
          (process.env.NODE_ENV !== 'production' && msg.codigo ? ` Código (somente dev): ${msg.codigo}` : '')
      )
      return
    }
    if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html })
  } catch (err) {
    console.error('[E-mail] Falha ao enviar:', err instanceof Error ? err.message : err)
  }
}

function moldura(titulo: string, corpo: string, link: string, rotuloBotao: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px">
      <h2>${escapeHtml(titulo)}</h2>
      ${corpo}
      <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#4338ca;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(rotuloBotao)}</a></p>
      <p style="color:#64748b;font-size:12px">Se o botão não funcionar, copie este endereço no navegador:<br>${escapeHtml(link)}</p>
    </div>`
}

export function linkDeRecuperacao(token: string): string {
  return `${appUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`
}

// Confirmação do cadastro: SÓ o código e a instrução. Sem link, sem botão, sem nome e sem
// marca — nada que dê a um terceiro o que clicar ou o que ver sobre a plataforma.
export async function enviarCodigoDeConfirmacao(to: string, codigo: string): Promise<void> {
  await enviar({
    to,
    codigo,
    subject: 'Seu código de confirmação',
    html: `
    <div style="font-family:Arial,sans-serif;max-width:420px">
      <p style="font-size:30px;letter-spacing:8px;font-weight:bold;margin:16px 0">${escapeHtml(codigo)}</p>
      <p>Digite o código na tela de cadastro e confirme o seu acesso.</p>
    </div>`,
  })
}

export async function enviarRecuperacaoDeSenha(to: string, token: string, validadeMinutos: number): Promise<void> {
  const link = linkDeRecuperacao(token)
  await enviar({
    to,
    link,
    subject: 'Redefinição de senha',
    html: moldura(
      'Redefinir sua senha',
      `<p>Recebemos um pedido para redefinir a senha desta conta. O link vale por ${validadeMinutos} minutos e só pode ser usado uma vez.</p>
       <p>Se não foi você, ignore este e-mail: nada será alterado.</p>`,
      link,
      'Escolher nova senha'
    ),
  })
}

// Alguém tentou criar conta com um e-mail que já existe. Em vez de responder
// "e-mail já cadastrado" na tela (o que revelaria quem é cliente), o dono do
// e-mail é avisado por aqui.
export async function enviarAvisoDeCadastroRepetido(to: string): Promise<void> {
  const link = `${appUrl()}/esqueci-senha`
  await enviar({
    to,
    link,
    subject: 'Tentativa de cadastro com seu e-mail',
    html: moldura(
      'Você já tem uma conta',
      `<p>Alguém tentou criar uma conta usando este e-mail, que já está cadastrado.</p>
       <p>Se foi você, entre normalmente ou recupere sua senha. Se não foi, ignore este aviso.</p>`,
      link,
      'Recuperar senha'
    ),
  })
}
