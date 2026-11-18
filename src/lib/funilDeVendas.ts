// ============================================================
// lib/funilDeVendas.ts — Contas puras do painel "Funil" do administrador:
// quem se cadastrou, confirmou o e-mail, usou o sistema de verdade e virou
// pagante; de onde veio (UTM/gclid do cadastro) e o link de WhatsApp para
// falar com a pessoa. Nada aqui toca banco: o serviço busca os dados e
// estas funções contam.
// ============================================================

import { diaDeBrasilia, horaDeBrasilia } from './dataDeBrasilia'

export const PERIODOS_DO_FUNIL = [7, 30, 90] as const
export type PeriodoDoFunil = (typeof PERIODOS_DO_FUNIL)[number]
export const PERIODO_PADRAO: PeriodoDoFunil = 30
export const MAXIMO_DE_CONTATOS = 200

export function lerPeriodo(valor: unknown): PeriodoDoFunil {
  const n = Number(Array.isArray(valor) ? valor[0] : valor)
  return (PERIODOS_DO_FUNIL as readonly number[]).includes(n) ? (n as PeriodoDoFunil) : PERIODO_PADRAO
}

// O cadastro público grava o aceite dos termos no mesmo instante em que cria o
// usuário. Conta criada pelo admin/dono nasce sem aceite e só aceita depois, no
// primeiro login, então a diferença entre as duas datas separa os dois casos.
const TOLERANCIA_DO_ACEITE_MS = 5 * 60 * 1000

export function ehCadastroPublico(u: { createdAt: Date; termsAcceptedAt: Date | null; isAdmin?: boolean }): boolean {
  if (u.isAdmin || !u.termsAcceptedAt) return false
  return Math.abs(u.termsAcceptedAt.getTime() - u.createdAt.getTime()) <= TOLERANCIA_DO_ACEITE_MS
}

// Porcentagem de `parte` sobre `total`, com uma casa. null quando não há base.
export function taxa(parte: number, total: number): number | null {
  if (!total) return null
  return Math.round((parte / total) * 1000) / 10
}

// ---------------------------------------------------------------
// Origem do cadastro (Company.origemDoCadastro)
// ---------------------------------------------------------------
export interface OrigemLida {
  fonte: string
  meio: string | null
  campanha: string | null
  termo: string | null
  anuncioDoGoogle: boolean
  interesse: { termo: string; uf: string | null } | null
}

export const ORIGEM_DIRETA = 'direto'

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function lerOrigem(origem: unknown): OrigemLida {
  const o = origem && typeof origem === 'object' && !Array.isArray(origem) ? (origem as Record<string, unknown>) : {}
  const anuncioDoGoogle = Boolean(texto(o.gclid) || texto(o.gbraid) || texto(o.wbraid))
  const bruto = o.interesse && typeof o.interesse === 'object' ? (o.interesse as Record<string, unknown>) : null
  const termoDoInteresse = bruto ? texto(bruto.termo) : null
  const anuncioDaMeta = !anuncioDoGoogle && Boolean(texto(o.fbclid))
  const fonteDoClique = anuncioDoGoogle ? 'google' : anuncioDaMeta ? 'meta' : ORIGEM_DIRETA
  return {
    fonte: texto(o.utm_source)?.toLowerCase() ?? fonteDoClique,
    meio: texto(o.utm_medium) ?? (!texto(o.utm_source) ? (anuncioDoGoogle ? 'cpc' : anuncioDaMeta ? 'paid_social' : null) : null),
    campanha: texto(o.utm_campaign),
    termo: texto(o.utm_term),
    anuncioDoGoogle,
    interesse: termoDoInteresse ? { termo: termoDoInteresse, uf: texto(bruto?.uf)?.toUpperCase() ?? null } : null,
  }
}

export function chaveDaOrigem(o: Pick<OrigemLida, 'fonte' | 'campanha'>): string {
  return o.campanha ? `${o.fonte} / ${o.campanha}` : o.fonte
}

// ---------------------------------------------------------------
// "Usou o sistema": ação real depois do cadastro. O item criado sozinho a
// partir do interesse informado no cadastro não conta.
// ---------------------------------------------------------------
export interface SinaisDeUso {
  itensMonitorados: number
  temInteresseNoCadastro: boolean
  favoritos: number
  planosDeParticipacao: number
  perguntasAoEdital: number
  analisesPedidas: number
}

export function usouOSistema(s: SinaisDeUso): boolean {
  const itensFeitosPelaPessoa = s.itensMonitorados - (s.temInteresseNoCadastro ? 1 : 0)
  return itensFeitosPelaPessoa > 0 || s.favoritos > 0 || s.planosDeParticipacao > 0 || s.perguntasAoEdital > 0 || s.analisesPedidas > 0
}

// ---------------------------------------------------------------
// Telefone → link do WhatsApp (só dígitos, com 55 do Brasil)
// ---------------------------------------------------------------
// Com "+" na frente o número já vem com o código do país e é usado como está;
// sem ele, 10 ou 11 dígitos (DDD + número) ganham o 55 do Brasil.
export function numeroParaWhatsApp(telefone: string | null | undefined): string | null {
  const bruto = (telefone ?? '').trim()
  if (bruto.startsWith('+')) {
    const internacional = bruto.replace(/\D/g, '')
    if (!internacional.startsWith('55')) return internacional.length >= 8 && internacional.length <= 15 ? internacional : null
  }
  let digitos = bruto.replace(/\D/g, '').replace(/^0+/, '')
  if (digitos.length === 10 || digitos.length === 11) digitos = '55' + digitos
  if (!digitos.startsWith('55') || (digitos.length !== 12 && digitos.length !== 13)) return null
  return digitos
}

export function linkDoWhatsApp(telefone: string | null | undefined): string | null {
  const numero = numeroParaWhatsApp(telefone)
  return numero ? `https://wa.me/${numero}` : null
}

// ---------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------
export interface CadastroDoFunil {
  criadoEm: Date
  emailConfirmado: boolean
  usou: boolean
  pagante: boolean
  origem: Pick<OrigemLida, 'fonte' | 'campanha'>
}

export interface Etapas {
  cadastros: number
  emailConfirmado: number
  usaram: number
  pagantes: number
}

export interface Taxas {
  confirmacao: number | null
  uso: number | null
  pagamento: number | null
  total: number | null
}

export interface SemanaDoFunil extends Etapas {
  semana: string // segunda-feira (AAAA-MM-DD, horário de Brasília)
}

export interface OrigemDoFunil extends Etapas {
  origem: string
  fonte: string
  campanha: string | null
}

const DIA_MS = 24 * 60 * 60 * 1000

// Segunda-feira da semana (horário de Brasília) em que `d` cai.
export function semanaDe(d: Date): string {
  const [ano, mes, dia] = diaDeBrasilia(d).split('-').map(Number)
  const meiaNoite = horaDeBrasilia(ano, mes - 1, dia)
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() // 0 = domingo
  const voltar = (diaDaSemana + 6) % 7
  return diaDeBrasilia(new Date(meiaNoite.getTime() - voltar * DIA_MS))
}

function vazio(): Etapas {
  return { cadastros: 0, emailConfirmado: 0, usaram: 0, pagantes: 0 }
}

function somar(e: Etapas, c: CadastroDoFunil): void {
  e.cadastros++
  if (c.emailConfirmado) e.emailConfirmado++
  if (c.usou) e.usaram++
  if (c.pagante) e.pagantes++
}

export function taxasDoFunil(e: Etapas): Taxas {
  return {
    confirmacao: taxa(e.emailConfirmado, e.cadastros),
    uso: taxa(e.usaram, e.emailConfirmado),
    pagamento: taxa(e.pagantes, e.usaram),
    total: taxa(e.pagantes, e.cadastros),
  }
}

export function montarFunil(cadastros: CadastroDoFunil[], desde: Date, ate: Date): { totais: Etapas; taxas: Taxas; semanas: SemanaDoFunil[]; origens: OrigemDoFunil[] } {
  const totais = vazio()
  const semanas = new Map<string, SemanaDoFunil>()
  // Todas as semanas do período aparecem, mesmo sem cadastro.
  const ultima = semanaDe(ate)
  for (let t = new Date(semanaDe(desde) + 'T12:00:00-03:00').getTime(); semanaDe(new Date(t)) <= ultima; t += 7 * DIA_MS) {
    const s = semanaDe(new Date(t))
    semanas.set(s, { semana: s, ...vazio() })
  }
  const origens = new Map<string, OrigemDoFunil>()

  for (const c of cadastros) {
    somar(totais, c)
    const s = semanaDe(c.criadoEm)
    if (!semanas.has(s)) semanas.set(s, { semana: s, ...vazio() })
    somar(semanas.get(s)!, c)
    const chave = chaveDaOrigem(c.origem)
    if (!origens.has(chave)) origens.set(chave, { origem: chave, fonte: c.origem.fonte, campanha: c.origem.campanha, ...vazio() })
    somar(origens.get(chave)!, c)
  }

  return {
    totais,
    taxas: taxasDoFunil(totais),
    semanas: [...semanas.values()].sort((a, b) => b.semana.localeCompare(a.semana)),
    origens: [...origens.values()].sort((a, b) => b.cadastros - a.cadastros || b.pagantes - a.pagantes || a.origem.localeCompare(b.origem)),
  }
}
