import type { Tom } from '@/components/ui'

export type Ciclo = 'MENSAL' | 'ANUAL'

export interface PlanoParaAssinar {
  code: string
  nome: string
  descricao: string | null
  precoMensalCentavos: number | null
  precoAnualCentavos: number | null
}

export interface AssinaturaDaTela {
  id: string
  planCode: string
  plano: string
  ciclo: Ciclo
  status: 'PENDENTE' | 'ATIVA' | 'ATRASADA' | 'CANCELADA'
  valorCentavos: number
  valorCheioCentavos: number
  cupom: string | null
  descontoAte: string | null
  pagoAte: string | null
  canceladaEm: string | null
  createdAt: string
}

export interface PagamentoDaTela {
  id: string
  status: string
  situacao: string
  emAberto: boolean
  forma: string | null
  valorCentavos: number
  vencimento: string
  pagoEm: string | null
  linkDaFatura: string | null
}

export interface ResumoDaCobranca {
  disponivel: boolean
  podeGerenciar: boolean
  planos: PlanoParaAssinar[]
  assinatura: AssinaturaDaTela | null
  pagamentos: PagamentoDaTela[]
}

export const ROTULO_DO_STATUS: Record<AssinaturaDaTela['status'], string> = {
  PENDENTE: 'Aguardando o 1º pagamento',
  ATIVA: 'Ativa',
  ATRASADA: 'Fatura vencida',
  CANCELADA: 'Cancelada',
}

export const TOM_DO_STATUS: Record<AssinaturaDaTela['status'], Tom> = {
  PENDENTE: 'accent',
  ATIVA: 'ok',
  ATRASADA: 'danger',
  CANCELADA: 'neutral',
}

export const ROTULO_DA_FORMA: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão',
  UNDEFINED: 'A escolher',
}

export function tomDoPagamento(p: PagamentoDaTela): Tom {
  if (p.status === 'OVERDUE') return 'danger'
  if (p.emAberto) return 'accent'
  if (p.pagoEm && p.situacao === 'Paga') return 'ok'
  return 'neutral'
}

export function reais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}

export function diaDoVencimento(dia: string): string {
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}

export function diaEmBrasilia(iso: string | null): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export function precoDoCiclo(plano: PlanoParaAssinar, ciclo: Ciclo): number | null {
  return ciclo === 'ANUAL' ? plano.precoAnualCentavos : plano.precoMensalCentavos
}

export function economiaDoAnual(plano: PlanoParaAssinar): number | null {
  if (!plano.precoMensalCentavos || !plano.precoAnualCentavos) return null
  const economia = plano.precoMensalCentavos * 12 - plano.precoAnualCentavos
  return economia > 0 ? economia : null
}
