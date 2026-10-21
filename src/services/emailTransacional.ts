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
import { enviarPeloResend } from '../lib/envioPeloResend'
import { appUrl } from '../lib/appUrl'
import { escapeHtml } from '../lib/html'
import { emailDaMarca } from '../lib/emailDaMarca'
import { quantidadeCom } from '../lib/plural'

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

async function enviar(msg: EmailEnviado): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === 'test') {
      caixaDeSaidaDeTeste.push(msg)
      return true
    }
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        `[E-mail] RESEND_API_KEY não configurada — "${msg.subject}" não foi enviado.` +
          (process.env.NODE_ENV !== 'production' && msg.link ? ` Link (somente dev): ${msg.link}` : '') +
          (process.env.NODE_ENV !== 'production' && msg.codigo ? ` Código (somente dev): ${msg.codigo}` : '')
      )
      return false
    }
    if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
    await enviarPeloResend(resend, { from: EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html })
    return true
  } catch (err) {
    console.error('[E-mail] Falha ao enviar:', err instanceof Error ? err.message : err)
    return false
  }
}

function moldura(titulo: string, corpo: string, link: string, rotuloBotao: string): string {
  return emailDaMarca({ previa: titulo, titulo, corpo: corpo.replace(/<p>/g, '<p style="margin:0 0 12px">'), botao: { texto: rotuloBotao, link } })
}

export function linkDoAcessoEncerrado(): string {
  return `${appUrl()}/acesso-encerrado`
}

export async function enviarAvisoDeAcessoEncerrado(to: string, { licitacoesEsperando, emTeste }: { licitacoesEsperando: number; emTeste: boolean }): Promise<void> {
  const link = linkDoAcessoEncerrado()
  const esperando = quantidadeCom(licitacoesEsperando, 'licitação nova esperando', 'licitações novas esperando')
  await enviar({
    to,
    link,
    subject: `${emTeste ? 'Seu teste terminou' : 'Seu acesso terminou'}: ${esperando} por você`,
    html: moldura(
      emTeste ? 'Seu teste grátis terminou' : 'O acesso da sua conta terminou',
      `<p>A Licita Bela continua procurando licitações para os itens que você cadastrou: há ${escapeHtml(esperando)} por você, guardadas na sua conta.</p>
       <p>Enquanto o acesso estiver encerrado, você não recebe os avisos de cada licitação. Veja como continuar ou pedir uma cópia dos seus dados.</p>`,
      link,
      'Ver como continuar'
    ),
  })
}

export function linkDeRecuperacao(token: string): string {
  return `${appUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`
}

// Confirmação do cadastro: o código e a instrução, com a marca. Sem link, sem botão e sem
// nome — nada que dê a um terceiro o que clicar.
export async function enviarCodigoDeConfirmacao(to: string, codigo: string): Promise<void> {
  await enviar({
    to,
    codigo,
    subject: 'Seu código de confirmação',
    html: emailDaMarca({
      previa: `Seu código é ${codigo}`,
      titulo: 'Seu código de confirmação',
      corpo: `<p style="margin:8px 0 16px;padding:16px 0;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#0b1f44;background:#f4f8ff;border:1px solid #dbe6f7;border-radius:12px">${escapeHtml(codigo)}</p>
      <p style="margin:0 0 12px">Digite o código na tela de cadastro e confirme o seu acesso.</p>
      <p style="margin:0;font-size:13px;color:#5b6b8c">O código vale por 15 minutos. Se você não pediu, ignore este e-mail.</p>`,
    }),
  })
}

export async function enviarConviteDeAcessoPorEmail(to: string, nome: string | null, token: string, validadeHoras: number): Promise<boolean> {
  const link = linkDeRecuperacao(token)
  return enviar({
    to,
    link,
    subject: 'Seu acesso à Licita Bela',
    html: moldura(
      nome ? `Olá, ${nome}` : 'Seu acesso está pronto',
      `<p>Criamos um acesso à Licita Bela para você. O seu login é este e-mail: <strong>${escapeHtml(to)}</strong>.</p>
       <p>Clique no botão para criar a sua senha. O link vale por ${validadeHoras} horas e só pode ser usado uma vez. Se ele vencer, use "Esqueci minha senha" na tela de entrada.</p>`,
      link,
      'Criar minha senha'
    ),
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

// Alguém tentou criar uma conta para o CNPJ/CPF de uma empresa que já é cliente. O dono da conta
// é avisado (a tela de quem tentou diz que já existe cadastro, mas não revela o e-mail do dono).
export async function enviarAvisoDeDocumentoRepetido(to: string, tipoDoDocumento: 'CNPJ' | 'CPF'): Promise<void> {
  const link = `${appUrl()}/login`
  await enviar({
    to,
    link,
    subject: `Tentativa de cadastro com o ${tipoDoDocumento} da sua empresa`,
    html: moldura(
      'Sua empresa já tem cadastro',
      `<p>Alguém tentou criar uma nova conta usando o ${tipoDoDocumento} da sua empresa, que já está cadastrado com este e-mail.</p>
       <p>Se foi um colega, convide-o em <strong>Empresa &rarr; Membros</strong> depois de entrar. Se não foi ninguém conhecido, ignore este aviso.</p>`,
      link,
      'Entrar'
    ),
  })
}

export async function enviarRespostaDoChamado(to: string, chamado: { numero: number; assunto: string }, resposta: string): Promise<boolean> {
  const link = `${appUrl()}/suporte/chamados/${chamado.numero}`
  const trecho = resposta.length > 1500 ? `${resposta.slice(0, 1499)}…` : resposta
  return enviar({
    to,
    link,
    subject: `Resposta ao chamado #${chamado.numero}`,
    html: moldura(
      `Resposta ao chamado #${chamado.numero}`,
      `<p>O suporte respondeu ao seu chamado <strong>${escapeHtml(chamado.assunto)}</strong>:</p>
       <p style="white-space:pre-line">${escapeHtml(trecho)}</p>`,
      link,
      'Ver o chamado'
    ),
  })
}

export interface FaturaDoEmail {
  plano: string
  valor: string
  vencimento: string
  link: string
}

export async function enviarFaturaDaAssinatura(to: string, fatura: FaturaDoEmail): Promise<boolean> {
  return enviar({
    to,
    link: fatura.link,
    subject: `Fatura da Licita Bela: vence em ${fatura.vencimento}`,
    html: moldura(
      'Sua fatura está disponível',
      `<p>A fatura do plano <strong>${escapeHtml(fatura.plano)}</strong> já está disponível.</p>
       <p>Valor: <strong>${escapeHtml(fatura.valor)}</strong><br>Vencimento: <strong>${escapeHtml(fatura.vencimento)}</strong></p>
       <p>Você pode pagar por Pix, boleto ou cartão na página da fatura, que é do Asaas, a empresa que faz a nossa cobrança.</p>`,
      fatura.link,
      'Pagar a fatura'
    ),
  })
}

export async function enviarAvisoDeFaturaVencida(to: string, fatura: FaturaDoEmail & { limite: string }): Promise<boolean> {
  return enviar({
    to,
    link: fatura.link,
    subject: 'Fatura da Licita Bela vencida',
    html: moldura(
      'Sua fatura venceu',
      `<p>Não identificamos o pagamento da fatura do plano <strong>${escapeHtml(fatura.plano)}</strong>, de <strong>${escapeHtml(fatura.valor)}</strong>, que venceu em ${escapeHtml(fatura.vencimento)}.</p>
       <p>Para não perder o acesso, pague até <strong>${escapeHtml(fatura.limite)}</strong>. Depois dessa data o acesso fica suspenso até o pagamento, e nada é apagado.</p>
       <p>Se já pagou, desconsidere: a confirmação do boleto pode levar até 3 dias úteis.</p>`,
      fatura.link,
      'Pagar a fatura'
    ),
  })
}

export async function enviarPagamentoConfirmado(to: string, pagamento: { plano: string; valor: string; acessoAte: string }): Promise<boolean> {
  const link = `${appUrl()}/conta`
  return enviar({
    to,
    link,
    subject: 'Pagamento confirmado: Licita Bela',
    html: moldura(
      'Pagamento confirmado',
      `<p>Recebemos o pagamento de <strong>${escapeHtml(pagamento.valor)}</strong> do plano <strong>${escapeHtml(pagamento.plano)}</strong>. Obrigado!</p>
       <p>O período pago vai até <strong>${escapeHtml(pagamento.acessoAte)}</strong>. O recibo fica na página da fatura do Asaas, e o histórico em Minha conta.</p>`,
      link,
      'Ver minha assinatura'
    ),
  })
}
