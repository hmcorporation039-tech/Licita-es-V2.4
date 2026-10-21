import { createHmac, timingSafeEqual } from 'node:crypto'
import { appUrl } from './appUrl'

export const TIPOS_DE_AVISO = ['resumo-diario', 'lembrete-de-prazo', 'aviso-de-documento', 'aviso-de-alteracao'] as const
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number]

export type CampoDaPreferencia = 'receberResumoDiario' | 'receberLembreteDePrazo' | 'receberAvisoDeDocumento' | 'receberAvisoDeAlteracao'

export const CAMPO_DA_PREFERENCIA: Record<TipoDeAviso, CampoDaPreferencia> = {
  'resumo-diario': 'receberResumoDiario',
  'lembrete-de-prazo': 'receberLembreteDePrazo',
  'aviso-de-documento': 'receberAvisoDeDocumento',
  'aviso-de-alteracao': 'receberAvisoDeAlteracao',
}

export const NOME_DO_AVISO: Record<TipoDeAviso, string> = {
  'resumo-diario': 'Resumo diário de licitações novas',
  'lembrete-de-prazo': 'Lembrete de prazo das licitações escolhidas',
  'aviso-de-documento': 'Aviso de documento perto de vencer',
  'aviso-de-alteracao': 'Aviso de licitação alterada pelo órgão',
}

const VERSAO_DO_TOKEN = 'd1'
const SEGREDO_MINIMO = 16
const TAMANHO_MAXIMO_DO_TOKEN = 300

export interface DadosDoDescadastro {
  userId: string
  tipo: TipoDeAviso
}

export interface LinksDeDescadastro {
  pagina: string
  umClique: string
}

function tipoDeAvisoValido(valor: string): valor is TipoDeAviso {
  return (TIPOS_DE_AVISO as readonly string[]).includes(valor)
}

function assinatura(conteudo: string, segredo: string): Buffer {
  return createHmac('sha256', `descadastro:${segredo}`).update(conteudo).digest()
}

export function tokenDeDescadastro(userId: string, tipo: TipoDeAviso, segredo: string = process.env.JWT_SECRET ?? ''): string | null {
  if (segredo.length < SEGREDO_MINIMO) return null
  const conteudo = Buffer.from(`${VERSAO_DO_TOKEN}:${userId}:${tipo}`).toString('base64url')
  return `${conteudo}.${assinatura(conteudo, segredo).toString('base64url')}`
}

export function lerTokenDeDescadastro(token: unknown, segredo: string = process.env.JWT_SECRET ?? ''): DadosDoDescadastro | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > TAMANHO_MAXIMO_DO_TOKEN) return null
  if (segredo.length < SEGREDO_MINIMO) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [conteudo, assinaturaRecebida] = partes
  const esperada = assinatura(conteudo, segredo)
  const recebida = Buffer.from(assinaturaRecebida, 'base64url')
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null
  const [versao, userId, tipo, ...sobra] = Buffer.from(conteudo, 'base64url').toString('utf8').split(':')
  if (sobra.length > 0 || versao !== VERSAO_DO_TOKEN || !userId || !tipo || !tipoDeAvisoValido(tipo)) return null
  return { userId, tipo }
}

export function linksDeDescadastro(userId: string, tipo: TipoDeAviso, env: NodeJS.ProcessEnv = process.env): LinksDeDescadastro | undefined {
  const token = tokenDeDescadastro(userId, tipo, env.JWT_SECRET ?? '')
  if (!token) return undefined
  const base = appUrl(env)
  const parametro = encodeURIComponent(token)
  return { pagina: `${base}/descadastro?t=${parametro}`, umClique: `${base}/descadastro/um-clique?t=${parametro}` }
}

export function cabecalhosDeDescadastro(links: LinksDeDescadastro | undefined): Record<string, string> | undefined {
  if (!links) return undefined
  return { 'List-Unsubscribe': `<${links.umClique}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
}
