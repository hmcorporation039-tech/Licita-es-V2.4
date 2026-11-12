// ============================================================
// lib/abertasDoComercial.ts — Regras puras da rota interna /api/interno/abertas,
// usada pelo comercial-ia para montar mensagens de venda com uma licitação real.
// ============================================================

import { timingSafeEqual } from 'node:crypto'
import type { FonteEnum, ModalidadeEnum } from '@prisma/client'
import { appUrl } from './appUrl'
import { safeHttpUrl } from './html'
import { paginaDoEditalNoPncp } from './linkDoEdital'
import { ROTULOS_DE_MODALIDADE } from './planilhasDaEmpresa'

// Abaixo disso a chave é fácil de adivinhar: a rota fica desligada.
export const TAMANHO_MINIMO_DA_CHAVE = 32

/** A chave configurada em COMERCIAL_IA_CHAVE, ou null quando a rota está desligada. */
export function chaveDoComercial(env: NodeJS.ProcessEnv = process.env): string | null {
  const chave = env.COMERCIAL_IA_CHAVE?.trim()
  return chave && chave.length >= TAMANHO_MINIMO_DA_CHAVE ? chave : null
}

/** Compara a chave recebida com a esperada em tempo constante. */
export function chaveConfere(recebida: unknown, esperada: string): boolean {
  if (typeof recebida !== 'string' || !recebida) return false
  const a = Buffer.from(recebida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** "Pregão eletrônico", "Dispensa sem disputa"... */
export function rotuloDaModalidade(modalidade: ModalidadeEnum): string {
  return ROTULOS_DE_MODALIDADE[modalidade] ?? 'Outras'
}

export function valorComoNumero(valor: { toNumber(): number } | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const n = typeof valor === 'number' ? valor : valor.toNumber()
  return Number.isFinite(n) && n > 0 ? n : null
}

// O lead ainda não tem conta: o link da origem abre sem login. A página na Licita Bela
// fica como reserva, quando a origem não informou um endereço válido.
export function linkDaLicitacao(t: { id: string; fonte: FonteEnum; linkEdital: string | null; numeroControle: string | null }, env: NodeJS.ProcessEnv = process.env): string {
  const origem = t.linkEdital ? safeHttpUrl(t.linkEdital.trim()) : null
  const pncp = t.fonte === 'PNCP' || t.fonte === 'COMPRASNET' ? paginaDoEditalNoPncp(t.numeroControle) : null
  return origem ?? pncp ?? `${appUrl(env)}/tenders/${t.id}`
}

const MAX_PONTOS = 5
const MAX_TAMANHO_DO_PONTO = 160
const PESO: Record<string, number> = { alta: 0, media: 1, baixa: 2 }

/**
 * Os pontos de atenção da análise do edital já guardada (campo `riscos` do resultado).
 * Só títulos curtos, os mais graves primeiro. Sem análise pronta, lista vazia.
 */
export function pontosDeAtencao(analise: { status: string; resultado: unknown } | null | undefined): string[] {
  if (!analise || analise.status !== 'DONE') return []
  const riscos = (analise.resultado as { riscos?: unknown } | null)?.riscos
  if (!Array.isArray(riscos)) return []
  return riscos
    .filter((r): r is { titulo: string; severidade?: string } => typeof r === 'object' && r !== null && typeof (r as { titulo?: unknown }).titulo === 'string')
    .map((r, i) => ({ texto: r.titulo.replace(/\s+/g, ' ').trim(), peso: PESO[r.severidade ?? ''] ?? 3, i }))
    .filter((r) => r.texto.length > 0)
    .sort((a, b) => a.peso - b.peso || a.i - b.i)
    .slice(0, MAX_PONTOS)
    .map((r) => (r.texto.length > MAX_TAMANHO_DO_PONTO ? `${r.texto.slice(0, MAX_TAMANHO_DO_PONTO - 3)}...` : r.texto))
}
