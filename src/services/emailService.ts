// ============================================================
// services/emailService.ts — Envio de e-mail via Resend
// ============================================================

import { Resend } from 'resend'
import { escapeHtml, safeHttpUrl } from '../lib/html'

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@seudominio.com.br'

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

function linkHtml(url: string | null | undefined, rotulo: string): string {
  const href = safeHttpUrl(url)
  return href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(rotulo)}</a></p>` : ''
}

export interface MatchEmailParams {
  to: string
  itemName: string
  tenderObjeto: string
  orgao?: string | null
  uf?: string | null
  valorEstimado?: number | null
  linkEdital?: string | null
}

export async function sendMatchEmail(params: MatchEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY não configurada — e-mail não enviado.')
    return
  }

  const { to, itemName, tenderObjeto, orgao, uf, valorEstimado, linkEdital } = params

  await getResendClient().emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Nova licitação encontrada: ${itemName}`,
    html: `
      <h2>Encontramos uma licitação para "${escapeHtml(itemName)}"</h2>
      <p><strong>Objeto:</strong> ${escapeHtml(tenderObjeto)}</p>
      ${orgao ? `<p><strong>Órgão:</strong> ${escapeHtml(orgao)}</p>` : ''}
      ${uf ? `<p><strong>UF:</strong> ${escapeHtml(uf)}</p>` : ''}
      ${valorEstimado ? `<p><strong>Valor estimado:</strong> R$ ${escapeHtml(valorEstimado.toLocaleString('pt-BR'))}</p>` : ''}
      ${linkHtml(linkEdital, 'Ver edital')}
    `,
  })
}

export interface DocumentExpiryEmailParams {
  to: string
  documentName: string
  diasRestantes: number
  dataValidade: Date
}

export async function sendDocumentExpiryEmail(params: DocumentExpiryEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY não configurada — e-mail não enviado.')
    return
  }

  const { to, documentName, diasRestantes, dataValidade } = params
  const vencido = diasRestantes < 0
  const dataFormatada = dataValidade.toLocaleDateString('pt-BR')

  await getResendClient().emails.send({
    from: EMAIL_FROM,
    to,
    subject: vencido
      ? `Documento vencido: ${documentName}`
      : `Documento vencendo em ${diasRestantes} dia(s): ${documentName}`,
    html: `
      <h2>${vencido ? 'Documento vencido' : 'Documento próximo do vencimento'}</h2>
      <p><strong>Documento:</strong> ${escapeHtml(documentName)}</p>
      <p><strong>Validade:</strong> ${escapeHtml(dataFormatada)} ${vencido ? '(já venceu)' : `(em ${diasRestantes} dia(s))`}</p>
      <p>Renove esse documento pra não perder o prazo de nenhuma licitação em andamento.</p>
    `,
  })
}

export const ROTULO_CAMPO_ALTERADO: Record<string, string> = {
  objeto: 'Objeto',
  valorEstimado: 'Valor estimado',
  aberturaAt: 'Abertura da sessão',
  encerramentoAt: 'Fim do recebimento de propostas',
  linkEdital: 'Link do edital',
}

export interface TenderChangedEmailParams {
  to: string
  tenderObjeto: string
  campos: string[]
  orgao?: string | null
  encerramentoAt?: Date | null
  linkEdital?: string | null
}

export async function sendTenderChangedEmail(params: TenderChangedEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY não configurada — e-mail não enviado.')
    return
  }

  const { to, tenderObjeto, campos, orgao, encerramentoAt, linkEdital } = params
  const rotulos = campos.map((campo) => ROTULO_CAMPO_ALTERADO[campo] ?? campo)

  await getResendClient().emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Uma licitação que você acompanha foi alterada',
    html: `
      <h2>Licitação alterada pelo órgão</h2>
      <p><strong>Objeto:</strong> ${escapeHtml(tenderObjeto)}</p>
      ${orgao ? `<p><strong>Órgão:</strong> ${escapeHtml(orgao)}</p>` : ''}
      <p><strong>O que mudou:</strong> ${escapeHtml(rotulos.join(', '))}</p>
      ${
        encerramentoAt
          ? `<p><strong>Novo fim do recebimento de propostas:</strong> ${escapeHtml(
              encerramentoAt.toLocaleString('pt-BR')
            )}</p>`
          : ''
      }
      <p>Confira o edital atualizado antes de enviar sua proposta.</p>
      ${linkHtml(linkEdital, 'Ver edital')}
    `,
  })
}
