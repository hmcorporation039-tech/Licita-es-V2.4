// ============================================================
// services/emailService.ts — Envio de e-mail via Resend
// ============================================================

import { Resend } from 'resend'
import { escapeHtml, safeHttpUrl } from '../lib/html'
import { formatarDiaDoCalendario, formatarDiaEHoraDeBrasilia, formatarPrazoDaLicitacao } from '../lib/dataDeBrasilia'
import { appUrl } from '../lib/appUrl'

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@seudominio.com.br'

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

function emReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function linkHtml(url: string | null | undefined, rotulo: string): string {
  const href = safeHttpUrl(url)
  return href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(rotulo)}</a></p>` : ''
}

export interface MatchEmailParams {
  to: string
  itemName: string
  tenderId: string
  tenderObjeto: string
  fonte: string
  orgao?: string | null
  municipio?: string | null
  uf?: string | null
  valorEstimado?: number | null
  encerramentoAt?: Date | null
  aberturaAt?: Date | null
  linkEdital?: string | null
}

const FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS = new Set(['PNCP', 'COMPRASNET'])

export function prazoDoEmailDeMatch(p: Pick<MatchEmailParams, 'fonte' | 'encerramentoAt' | 'aberturaAt'>): { rotulo: string; valor: string } {
  if (p.encerramentoAt) return { rotulo: 'Prazo para enviar a proposta', valor: formatarPrazoDaLicitacao(p.encerramentoAt, p.fonte) }
  if (p.aberturaAt && !FONTES_COM_ABERTURA_NO_INICIO_DAS_PROPOSTAS.has(p.fonte)) {
    return { rotulo: 'Data da sessão', valor: formatarPrazoDaLicitacao(p.aberturaAt, p.fonte) }
  }
  return { rotulo: 'Prazo', valor: 'não informado pela fonte (confira no edital)' }
}

function localDaLicitacao(municipio: string | null | undefined, uf: string | null | undefined): { rotulo: string; valor: string } | null {
  if (municipio) return { rotulo: 'Município', valor: uf ? `${municipio}/${uf}` : municipio }
  return uf ? { rotulo: 'UF', valor: uf } : null
}

export function linkDaLicitacaoNoMonitor(tenderId: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${appUrl(env)}/tenders/${encodeURIComponent(tenderId)}`
}

export async function sendMatchEmail(params: MatchEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY não configurada — e-mail não enviado.')
    return
  }

  const { to, itemName, tenderId, tenderObjeto, orgao, municipio, uf, valorEstimado, linkEdital } = params
  const prazo = prazoDoEmailDeMatch(params)
  const local = localDaLicitacao(municipio, uf)

  await getResendClient().emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Nova licitação encontrada: ${itemName.replace(/[\r\n]+/g, ' ').slice(0, 150)}`,
    html: `
      <h2>Encontramos uma licitação para "${escapeHtml(itemName)}"</h2>
      <p><strong>Objeto:</strong> ${escapeHtml(tenderObjeto)}</p>
      <p><strong>${escapeHtml(prazo.rotulo)}:</strong> ${escapeHtml(prazo.valor)}</p>
      ${orgao ? `<p><strong>Órgão:</strong> ${escapeHtml(orgao)}</p>` : ''}
      ${local ? `<p><strong>${escapeHtml(local.rotulo)}:</strong> ${escapeHtml(local.valor)}</p>` : ''}
      ${valorEstimado ? `<p><strong>Valor estimado:</strong> ${escapeHtml(emReais(valorEstimado))}</p>` : ''}
      ${linkHtml(linkDaLicitacaoNoMonitor(tenderId), 'Abrir no Monitor de Licitações')}
      ${linkHtml(linkEdital, 'Ver edital na fonte')}
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
  const dataFormatada = formatarDiaDoCalendario(dataValidade)

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
  fonte?: string
  linkEdital?: string | null
}

export async function sendTenderChangedEmail(params: TenderChangedEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY não configurada — e-mail não enviado.')
    return
  }

  const { to, tenderObjeto, campos, orgao, encerramentoAt, fonte, linkEdital } = params
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
              fonte ? formatarPrazoDaLicitacao(encerramentoAt, fonte) : formatarDiaEHoraDeBrasilia(encerramentoAt)
            )}</p>`
          : ''
      }
      <p>Confira o edital atualizado antes de enviar sua proposta.</p>
      ${linkHtml(linkEdital, 'Ver edital')}
    `,
  })
}
