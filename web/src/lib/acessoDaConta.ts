const FUSO = 'America/Sao_Paulo'
const DIA_MS = 24 * 60 * 60 * 1000

const DIA_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
const DIA_COMPLETO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })

export type TomDoAcesso = 'neutral' | 'warn' | 'danger'

export interface SituacaoDoAcesso {
  texto: string
  dataCompleta: string
  diasRestantes: number
  expirado: boolean
  emTeste: boolean
  tom: TomDoAcesso
}

function diasEntre(de: Date, ate: Date): number {
  return Math.round((Date.parse(DIA_ISO.format(ate)) - Date.parse(DIA_ISO.format(de))) / DIA_MS)
}

function quantoFalta(dias: number): string {
  if (dias <= 0) return 'termina hoje'
  return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`
}

export function situacaoDoAcesso(acessoAte: string | null | undefined, emTeste: boolean, agora: Date = new Date()): SituacaoDoAcesso | null {
  if (!acessoAte) return null
  const ate = new Date(acessoAte)
  if (Number.isNaN(ate.getTime())) return null
  const expirado = ate.getTime() <= agora.getTime()
  const diasRestantes = expirado ? 0 : Math.max(0, diasEntre(agora, ate))
  const prefixo = emTeste ? 'Teste grátis' : 'Acesso'
  const texto = expirado ? `${prefixo} terminou em ${DIA_E_MES.format(ate)}` : `${prefixo} até ${DIA_E_MES.format(ate)} (${quantoFalta(diasRestantes)})`
  const tom: TomDoAcesso = expirado || diasRestantes <= 1 ? 'danger' : diasRestantes <= 3 ? 'warn' : 'neutral'
  return { texto, dataCompleta: DIA_COMPLETO.format(ate), diasRestantes, expirado, emTeste, tom }
}

export function numeroDoWhatsApp(valor: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP): string | null {
  const digitos = (valor ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
}

export function linkDoWhatsAppParaContinuar(numero: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent('Olá! Quero continuar usando a Licita Bela depois do teste.')}`
}
