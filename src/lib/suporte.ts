export const TIPOS_DE_CHAMADO = ['ERRO', 'DUVIDA', 'COBRANCA', 'SUGESTAO', 'OUTRO'] as const
export type TipoDeChamado = (typeof TIPOS_DE_CHAMADO)[number]

export const STATUS_DE_CHAMADO = ['ABERTO', 'EM_ANALISE', 'AGUARDANDO_CLIENTE', 'RESOLVIDO'] as const
export type StatusDeChamado = (typeof STATUS_DE_CHAMADO)[number]

export type OrigemDoChamado = 'FORMULARIO' | 'ATENDIMENTO'
export type AutorDaMensagem = 'CLIENTE' | 'SUPORTE'
export type OrigemDoErro = 'api' | 'web' | 'worker'

export const TAMANHO_MAXIMO_DO_ASSUNTO = 120
export const TAMANHO_MAXIMO_DO_RELATO = 4000
export const TAMANHO_MAXIMO_DA_MENSAGEM = 4000
export const MAX_ERROS_RECENTES_NO_CHAMADO = 10
export const MAX_CHAMADOS_POR_DIA = 10
export const DIAS_DE_GUARDA_DOS_ERROS = 30
export const DIAS_DE_GUARDA_DO_CHAMADO_RESOLVIDO = 365
export const JANELA_DOS_ERROS_DO_CHAMADO_MS = 30 * 60 * 1000

const FORMATO_DO_CODIGO = /^[A-Za-z0-9-]{8,64}$/

export function codigoDeRastreioValido(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_DO_CODIGO.test(valor)
}

export function cortar(texto: string | null | undefined, maximo: number): string | null {
  if (texto == null) return null
  const limpo = texto.trim()
  if (!limpo) return null
  return limpo.length > maximo ? `${limpo.slice(0, maximo - 1)}…` : limpo
}

export function rotaSemConsulta(rota: string): string {
  return rota.split('?')[0].split('#')[0].slice(0, 300)
}

export interface ErroRecenteDaTela {
  codigo?: string
  rota?: string
  status?: number
  mensagem?: string
  quando?: string
}

export interface ContextoDoChamado {
  tela: string | null
  navegador: string | null
  horario: string
  versao: string | null
  errosRecentes: ErroRecenteDaTela[]
}

export function codigosDosErros(contexto: unknown): string[] {
  const erros = (contexto as Partial<ContextoDoChamado> | null)?.errosRecentes
  if (!Array.isArray(erros)) return []
  return [...new Set(erros.map((e) => e?.codigo).filter(codigoDeRastreioValido))]
}

export function proximoStatusAoResponder(autor: AutorDaMensagem, atual: StatusDeChamado): StatusDeChamado {
  if (autor === 'SUPORTE') return atual === 'RESOLVIDO' ? 'RESOLVIDO' : 'AGUARDANDO_CLIENTE'
  return 'ABERTO'
}

export function versaoDoSistema(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.RAILWAY_GIT_COMMIT_SHA?.trim().slice(0, 12) || null
}
