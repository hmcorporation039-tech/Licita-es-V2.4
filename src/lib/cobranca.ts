import { timingSafeEqual } from 'node:crypto'

export const CICLOS = ['MENSAL', 'ANUAL'] as const
export type Ciclo = (typeof CICLOS)[number]

export const CICLO_NO_ASAAS: Record<Ciclo, 'MONTHLY' | 'YEARLY'> = { MENSAL: 'MONTHLY', ANUAL: 'YEARLY' }

export type StatusDaAssinatura = 'PENDENTE' | 'ATIVA' | 'ATRASADA' | 'CANCELADA'

export const DIAS_DE_TOLERANCIA = 5
export const DIAS_PARA_REEMBOLSO = 7
export const MULTA_PERCENTUAL = 2
export const JUROS_AO_MES_PERCENTUAL = 1

export const STATUS_PAGOS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
export const STATUS_ESTORNADOS = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'])
export const STATUS_EM_ABERTO = new Set(['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'])

export const ROTULO_DO_STATUS_DO_PAGAMENTO: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  OVERDUE: 'Vencida',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga',
  RECEIVED_IN_CASH: 'Paga',
  REFUNDED: 'Estornada',
  REFUND_REQUESTED: 'Estorno pedido',
  REFUND_IN_PROGRESS: 'Estorno em andamento',
  CHARGEBACK_REQUESTED: 'Contestada no cartão',
  CHARGEBACK_DISPUTE: 'Contestada no cartão',
  AWAITING_CHARGEBACK_REVERSAL: 'Contestada no cartão',
  AWAITING_RISK_ANALYSIS: 'Em análise',
  DELETED: 'Cancelada',
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

function partes(dia: string): [number, number, number] {
  if (!DIA.test(dia)) throw new Error(`Data inválida: ${dia}`)
  const [a, m, d] = dia.split('-').map(Number)
  return [a, m, d]
}

function formatar(a: number, m: number, d: number): string {
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function somarMeses(dia: string, meses: number): string {
  const [a, m, d] = partes(dia)
  const total = a * 12 + (m - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return formatar(ano, mes, Math.min(d, ultimo))
}

export function somarCiclo(dia: string, ciclo: Ciclo): string {
  return somarMeses(dia, ciclo === 'ANUAL' ? 12 : 1)
}

export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = partes(dia)
  const data = new Date(Date.UTC(a, m - 1, d + dias))
  return formatar(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate())
}

export function fimDoDiaEmBrasilia(dia: string): Date {
  partes(dia)
  return new Date(`${dia}T23:59:59.999-03:00`)
}

export function diaDoBanco(data: Date): string {
  return data.toISOString().slice(0, 10)
}

export function periodoPago(vencimento: string, ciclo: Ciclo): { pagoAte: Date; acessoAte: Date } {
  const fim = somarCiclo(vencimento, ciclo)
  return { pagoAte: fimDoDiaEmBrasilia(fim), acessoAte: fimDoDiaEmBrasilia(somarDias(fim, DIAS_DE_TOLERANCIA)) }
}

export function limiteParaPagarEmAtraso(vencimento: string): Date {
  return fimDoDiaEmBrasilia(somarDias(vencimento, DIAS_DE_TOLERANCIA))
}

export function reaisParaCentavos(valor: number): number {
  return Math.round(valor * 100)
}

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100
}

export function precoDoPlano(plano: { priceMonthlyCents: number | null; priceYearlyCents: number | null }, ciclo: Ciclo): number | null {
  const preco = ciclo === 'ANUAL' ? plano.priceYearlyCents : plano.priceMonthlyCents
  return preco && preco > 0 ? preco : null
}

export function valorComDesconto(cheioCentavos: number, percentual: number): number {
  return Math.round((cheioCentavos * (100 - percentual)) / 100)
}

export function descontoValeNoVencimento(descontoAte: Date | null, vencimento: string): boolean {
  return Boolean(descontoAte && fimDoDiaEmBrasilia(vencimento).getTime() <= descontoAte.getTime())
}

export function normalizarCodigoDoCupom(codigo: string): string {
  return codigo.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
}

export const CODIGO_DE_CUPOM = /^[A-Z0-9-]{3,30}$/

export interface CupomParaUso {
  ativo: boolean
  validoAte: Date | null
  maxUsos: number | null
  usos: number
}

export function motivoDoCupomRecusado(cupom: CupomParaUso | null, agora: Date = new Date()): string | null {
  if (!cupom || !cupom.ativo) return 'Cupom não encontrado'
  if (cupom.validoAte && cupom.validoAte.getTime() < agora.getTime()) return 'Este cupom venceu'
  if (cupom.maxUsos !== null && cupom.usos >= cupom.maxUsos) return 'As vagas deste cupom acabaram'
  return null
}

export function documentoDoCliente(empresa: { cnpj: string | null; cpf: string | null }): string | null {
  const numero = (empresa.cnpj ?? empresa.cpf ?? '').replace(/\D/g, '')
  return numero.length === 11 || numero.length === 14 ? numero : null
}

export function dentroDoPrazoDeReembolso(pagoEm: Date, agora: Date = new Date()): boolean {
  return agora.getTime() - pagoEm.getTime() <= DIAS_PARA_REEMBOLSO * 24 * 60 * 60 * 1000
}

export function statusPelosPagamentos(pagamentos: { status: string }[]): Exclude<StatusDaAssinatura, 'CANCELADA'> {
  if (pagamentos.some((p) => p.status === 'OVERDUE')) return 'ATRASADA'
  if (pagamentos.some((p) => STATUS_PAGOS.has(p.status))) return 'ATIVA'
  return 'PENDENTE'
}

export interface EventoDoAsaas {
  id: string
  evento: string
  cobrancaId: string | null
  assinaturaId: string | null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null
}

export function lerEventoDoAsaas(corpo: unknown): EventoDoAsaas | null {
  if (!corpo || typeof corpo !== 'object') return null
  const c = corpo as Record<string, unknown>
  const evento = texto(c.event)
  if (!evento || !/^[A-Z_]+$/.test(evento)) return null
  const pagamento = (c.payment && typeof c.payment === 'object' ? c.payment : {}) as Record<string, unknown>
  const assinatura = (c.subscription && typeof c.subscription === 'object' ? c.subscription : {}) as Record<string, unknown>
  const cobrancaId = texto(pagamento.id)
  const assinaturaId = texto(pagamento.subscription) ?? texto(assinatura.id)
  const id = texto(c.id) ?? [evento, cobrancaId ?? assinaturaId ?? 'sem-id', texto(pagamento.status) ?? texto(assinatura.status) ?? '', texto(c.dateCreated) ?? ''].join('|')
  return { id, evento, cobrancaId, assinaturaId }
}

export function tokenConfere(recebido: string | undefined, esperado: string | undefined): boolean {
  if (!recebido || !esperado || esperado.length < 32) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type AmbienteDoAsaas = 'sandbox' | 'producao'

export function configuracaoDoAsaas(env: NodeJS.ProcessEnv = process.env): { ambiente: AmbienteDoAsaas; base: string; chave: string } | null {
  const chave = env.ASAAS_API_KEY?.trim()
  if (!chave) return null
  const ambiente: AmbienteDoAsaas = env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox'
  const prefixo = ambiente === 'producao' ? '$aact_prod_' : '$aact_hmlg_'
  if (!chave.startsWith(prefixo)) return null
  return { ambiente, chave, base: ambiente === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3' }
}

export function formatarReais(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}
