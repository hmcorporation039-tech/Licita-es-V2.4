import { getSessionToken } from './session'

export interface ErroRecente {
  codigo?: string
  rota?: string
  status?: number
  mensagem?: string
  quando?: string
}

export type TipoDeChamado = 'ERRO' | 'DUVIDA' | 'COBRANCA' | 'SUGESTAO' | 'OUTRO'
export type StatusDeChamado = 'ABERTO' | 'EM_ANALISE' | 'AGUARDANDO_CLIENTE' | 'RESOLVIDO'

export const ROTULO_DO_TIPO: Record<TipoDeChamado, string> = {
  ERRO: 'Erro no sistema',
  DUVIDA: 'Dúvida de uso',
  COBRANCA: 'Cobrança e plano',
  SUGESTAO: 'Sugestão',
  OUTRO: 'Outro assunto',
}

export const ROTULO_DO_STATUS: Record<StatusDeChamado, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_CLIENTE: 'Respondido',
  RESOLVIDO: 'Resolvido',
}

export const TOM_DO_STATUS: Record<StatusDeChamado, 'accent' | 'warn' | 'ok' | 'neutral'> = {
  ABERTO: 'accent',
  EM_ANALISE: 'warn',
  AGUARDANDO_CLIENTE: 'ok',
  RESOLVIDO: 'neutral',
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'
const MAX_ERROS = 10
const MAX_ENVIOS_POR_PAGINA = 5
const CHAVE_DA_ULTIMA_TELA = 'licitacao-platform:ultima-tela'
const errosRecentes: ErroRecente[] = []
const enviados = new Set<string>()

export function novoCodigoDeRastreio(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function lembrarErro(erro: ErroRecente) {
  errosRecentes.push({ ...erro, rota: erro.rota?.split('?')[0], quando: new Date().toISOString() })
  if (errosRecentes.length > MAX_ERROS) errosRecentes.shift()
}

export function lerErrosRecentes(): ErroRecente[] {
  return [...errosRecentes]
}

export function lembrarTela(caminho: string) {
  try {
    if (!caminho.startsWith('/suporte')) window.sessionStorage.setItem(CHAVE_DA_ULTIMA_TELA, caminho)
  } catch {}
}

export function lerUltimaTela(): string | null {
  try {
    return window.sessionStorage.getItem(CHAVE_DA_ULTIMA_TELA)
  } catch {
    return null
  }
}

export function enviarErroDaTela(erro: unknown) {
  const token = getSessionToken()
  if (!token || typeof window === 'undefined') return
  const mensagem = (erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro)).slice(0, 1000)
  if (!mensagem || enviados.has(mensagem) || enviados.size >= MAX_ENVIOS_POR_PAGINA) return
  enviados.add(mensagem)
  const codigo = novoCodigoDeRastreio()
  lembrarErro({ codigo, mensagem, rota: window.location.pathname })
  void fetch(`${API_URL}/api/suporte/erros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mensagem,
      pilha: erro instanceof Error ? erro.stack?.slice(0, 4000) : undefined,
      tela: window.location.pathname,
      codigoDeRastreio: codigo,
    }),
  }).catch(() => undefined)
}
