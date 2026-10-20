// ============================================================
// services/emailService.ts — Envio de e-mail via Resend
// ============================================================

import { Resend } from 'resend'
import { enviarPeloResend } from '../lib/envioPeloResend'
import { escapeHtml } from '../lib/html'
import { emailDaMarca, paragrafo, type CartaoDoEmail } from '../lib/emailDaMarca'
import { formatarDiaDoCalendario, formatarDiaEHoraDeBrasilia, formatarPrazoDaLicitacao } from '../lib/dataDeBrasilia'
import { appUrl } from '../lib/appUrl'
import { quandoVence, quantidadeCom } from '../lib/plural'
import { momentoDoFimDoPrazo, textoDoTempoRestante } from '../lib/prazoDoAviso'

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@seudominio.com.br'

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

function emReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  await enviarPeloResend(getResendClient(), {
    from: EMAIL_FROM,
    to,
    subject: `Nova licitação encontrada: ${itemName.replace(/[\r\n]+/g, ' ').slice(0, 150)}`,
    html: emailDaMarca({
      previa: `${prazo.rotulo}: ${prazo.valor}`,
      titulo: `Licitação nova para "${itemName}"`,
      corpo: paragrafo(escapeHtml(tenderObjeto)),
      detalhes: [
        { rotulo: prazo.rotulo, valor: prazo.valor },
        ...(orgao ? [{ rotulo: 'Órgão', valor: orgao }] : []),
        ...(local ? [local] : []),
        ...(valorEstimado ? [{ rotulo: 'Valor estimado', valor: emReais(valorEstimado) }] : []),
      ],
      botao: { texto: 'Abrir na Licita Bela', link: linkDaLicitacaoNoMonitor(tenderId) },
      linkSecundario: linkEdital ? { texto: 'Ver edital na fonte', link: linkEdital } : undefined,
      motivo: 'Você recebeu este aviso porque a licitação combina com um item que você monitora na Licita Bela.',
    }),
  })
}

export interface LicitacaoDoAviso {
  tenderId: string
  objeto: string
  fonte: string
  orgao: string | null
  municipio: string | null
  uf: string | null
  encerramentoAt: Date | null
  aberturaAt: Date | null
}

export interface MatchParaResumo {
  tenderMatchId: string
  itemName: string
  dentroDeObraCompleta: boolean
  licitacao: LicitacaoDoAviso
}

export interface LicitacaoDoResumo extends LicitacaoDoAviso {
  itens: string[]
  tenderMatchIds: string[]
  dentroDeObraCompleta: boolean
}

export interface LicitacaoDoLembrete extends LicitacaoDoAviso {
  fimDoPrazo: Date
}

export interface EmailMontado {
  assunto: string
  html: string
}

export const MAX_LICITACOES_NO_RESUMO = 15
const MAX_CARACTERES_DO_OBJETO = 180

function textoResumido(texto: string, maximo: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, maximo - 1).trimEnd()}…`
}

function momentoParaOrdenar(licitacao: LicitacaoDoAviso): number {
  return momentoDoFimDoPrazo(licitacao)?.getTime() ?? Number.POSITIVE_INFINITY
}

export function agruparMatchesDoResumo(matches: MatchParaResumo[]): LicitacaoDoResumo[] {
  const porLicitacao = new Map<string, LicitacaoDoResumo>()
  for (const match of matches) {
    const existente = porLicitacao.get(match.licitacao.tenderId)
    if (!existente) {
      porLicitacao.set(match.licitacao.tenderId, {
        ...match.licitacao,
        itens: [match.itemName],
        tenderMatchIds: [match.tenderMatchId],
        dentroDeObraCompleta: match.dentroDeObraCompleta,
      })
      continue
    }
    if (!existente.itens.includes(match.itemName)) existente.itens.push(match.itemName)
    existente.tenderMatchIds.push(match.tenderMatchId)
    existente.dentroDeObraCompleta = existente.dentroDeObraCompleta && match.dentroDeObraCompleta
  }
  return [...porLicitacao.values()].sort(
    (a, b) => Number(a.dentroDeObraCompleta) - Number(b.dentroDeObraCompleta) || momentoParaOrdenar(a) - momentoParaOrdenar(b)
  )
}

function linhasDaLicitacao(licitacao: LicitacaoDoAviso): string[] {
  const local = localDaLicitacao(licitacao.municipio, licitacao.uf)
  return [...(licitacao.orgao ? [licitacao.orgao] : []), ...(local ? [local.valor] : [])]
}

function cartaoDoResumo(licitacao: LicitacaoDoResumo, env: NodeJS.ProcessEnv): CartaoDoEmail {
  const prazo = prazoDoEmailDeMatch(licitacao)
  return {
    titulo: textoResumido(licitacao.objeto, MAX_CARACTERES_DO_OBJETO),
    destaque: `${prazo.rotulo}: ${prazo.valor}`,
    linhas: [
      ...linhasDaLicitacao(licitacao),
      `${licitacao.itens.length === 1 ? 'Item' : 'Itens'}: ${licitacao.itens.join(', ')}`,
      ...(licitacao.dentroDeObraCompleta ? ['Faz parte de uma obra completa'] : []),
    ],
    link: { texto: 'Abrir', link: linkDaLicitacaoNoMonitor(licitacao.tenderId, env) },
  }
}

export function assuntoDoResumoDiario(total: number): string {
  return `${quantidadeCom(total, 'licitação nova', 'licitações novas')} para você hoje`
}

export function montarEmailDoResumoDiario(licitacoes: LicitacaoDoResumo[], env: NodeJS.ProcessEnv = process.env): EmailMontado {
  const total = licitacoes.length
  const visiveis = licitacoes.slice(0, MAX_LICITACOES_NO_RESUMO)
  const restantes = total - visiveis.length
  const primeiroPrazo = prazoDoEmailDeMatch(visiveis[0])
  return {
    assunto: assuntoDoResumoDiario(total),
    html: emailDaMarca({
      previa: `A mais urgente: ${primeiroPrazo.rotulo.toLowerCase()} ${primeiroPrazo.valor}`,
      titulo: `${quantidadeCom(total, 'licitação nova combina', 'licitações novas combinam')} com seus itens`,
      corpo: paragrafo('Estas licitações abertas apareceram desde o último resumo. As de prazo mais próximo vêm primeiro.'),
      cartoes: visiveis.map((licitacao) => cartaoDoResumo(licitacao, env)),
      notaDosCartoes: restantes > 0 ? `E mais ${quantidadeCom(restantes, 'licitação', 'licitações')} no painel.` : undefined,
      botao: { texto: restantes > 0 ? 'Ver todas as licitações' : 'Abrir meus matches', link: `${appUrl(env)}/matches` },
      motivo: 'Você recebe este resumo uma vez por dia porque monitora itens na Licita Bela.',
    }),
  }
}

export function assuntoDoLembreteDePrazo(total: number): string {
  return `Prazo encerrando: ${quantidadeCom(total, 'licitação escolhida', 'licitações escolhidas')}`
}

export function montarEmailDoLembreteDePrazo(licitacoes: LicitacaoDoLembrete[], agora: Date, env: NodeJS.ProcessEnv = process.env): EmailMontado {
  const ordenadas = [...licitacoes].sort((a, b) => a.fimDoPrazo.getTime() - b.fimDoPrazo.getTime())
  const total = ordenadas.length
  return {
    assunto: assuntoDoLembreteDePrazo(total),
    html: emailDaMarca({
      previa: `A mais próxima: ${textoDoTempoRestante(ordenadas[0].fimDoPrazo, agora)}`,
      titulo: total === 1 ? 'Uma licitação escolhida está perto do fim do prazo' : `${total} licitações escolhidas estão perto do fim do prazo`,
      corpo: paragrafo('Confira a proposta e os documentos antes que o prazo acabe.'),
      cartoes: ordenadas.map((licitacao) => {
        const prazo = prazoDoEmailDeMatch(licitacao)
        return {
          titulo: textoResumido(licitacao.objeto, MAX_CARACTERES_DO_OBJETO),
          destaque: `${prazo.rotulo}: ${prazo.valor} (${textoDoTempoRestante(licitacao.fimDoPrazo, agora)})`,
          linhas: linhasDaLicitacao(licitacao),
          link: { texto: 'Abrir', link: linkDaLicitacaoNoMonitor(licitacao.tenderId, env) },
        }
      }),
      botao: { texto: 'Abrir licitações escolhidas', link: `${appUrl(env)}/escolhidas` },
      motivo: 'Você recebeu este lembrete porque sua empresa marcou estas licitações como "Vou participar" na Licita Bela.',
    }),
  }
}

async function enviarEmailMontado(to: string, email: EmailMontado): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[emailService] RESEND_API_KEY não configurada — "${email.assunto}" não foi enviado.`)
    return false
  }
  await enviarPeloResend(getResendClient(), { from: EMAIL_FROM, to, subject: email.assunto, html: email.html })
  return true
}

export async function sendResumoDiarioEmail(to: string, licitacoes: LicitacaoDoResumo[]): Promise<boolean> {
  return enviarEmailMontado(to, montarEmailDoResumoDiario(licitacoes))
}

export async function sendLembreteDePrazoEmail(to: string, licitacoes: LicitacaoDoLembrete[], agora: Date): Promise<boolean> {
  return enviarEmailMontado(to, montarEmailDoLembreteDePrazo(licitacoes, agora))
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

  await enviarPeloResend(getResendClient(), {
    from: EMAIL_FROM,
    to,
    subject: vencido ? `Documento vencido: ${documentName}` : `Documento ${quandoVence(diasRestantes)}: ${documentName}`,
    html: emailDaMarca({
      previa: vencido ? `${documentName} venceu` : `${documentName} ${quandoVence(diasRestantes)}`,
      titulo: vencido ? 'Documento vencido' : 'Documento perto de vencer',
      corpo: paragrafo('Renove este documento para não perder o prazo de nenhuma licitação em andamento.'),
      detalhes: [
        { rotulo: 'Documento', valor: documentName },
        { rotulo: 'Validade', valor: `${dataFormatada} ${vencido ? '(já venceu)' : `(${quandoVence(diasRestantes)})`}` },
      ],
      botao: { texto: 'Abrir meus documentos', link: `${appUrl()}/empresa` },
    }),
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

  await enviarPeloResend(getResendClient(), {
    from: EMAIL_FROM,
    to,
    subject: 'Uma licitação que você acompanha foi alterada',
    html: emailDaMarca({
      previa: `O que mudou: ${rotulos.join(', ')}`,
      titulo: 'Licitação alterada pelo órgão',
      corpo: paragrafo(escapeHtml(tenderObjeto)),
      detalhes: [
        ...(orgao ? [{ rotulo: 'Órgão', valor: orgao }] : []),
        { rotulo: 'O que mudou', valor: rotulos.join(', ') },
        ...(encerramentoAt
          ? [{ rotulo: 'Novo fim do recebimento de propostas', valor: fonte ? formatarPrazoDaLicitacao(encerramentoAt, fonte) : formatarDiaEHoraDeBrasilia(encerramentoAt) }]
          : []),
      ],
      botao: linkEdital ? { texto: 'Ver edital atualizado', link: linkEdital } : undefined,
      motivo: 'Você recebeu este aviso porque acompanha esta licitação na Licita Bela. Confira o edital antes de enviar a proposta.',
    }),
  })
}
