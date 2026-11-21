// ============================================================
// lib/jornadaDaBela.ts — "Bela que acompanha": a Bela se oferece para levar a
// pessoa do teste, passo a passo, até a primeira licitação. Aqui fica só a regra
// (fases, quando oferecer, o que pode ser gravado). A tela é
// web/src/components/BelaAcompanha.tsx; a API, GET/PUT /api/bela/jornada.
//
// Etapa 1 (11/2026): convite → o que vende → onde → buscando → resultado.
// A Bela nunca entra em portal, nunca envia proposta nem dá lance: só pergunta,
// cadastra o item que a pessoa confirmou e mostra as telas.
// ============================================================

import { z } from 'zod'
import { PLANO_DE_TESTE } from './acessoEncerrado'

export const FASES_DA_JORNADA = ['convite', 'adiada', 'recusada', 'oQueVende', 'onde', 'buscando', 'resultado', 'etapa1Feita'] as const
export type FaseDaJornada = (typeof FASES_DA_JORNADA)[number]

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

/** O que a tela pode gravar. Tudo opcional menos a fase; nada além disso entra no banco. */
export const pedidoDaJornadaSchema = z.object({
  fase: z.enum(FASES_DA_JORNADA),
  termo: z.string().trim().max(120).optional(),
  ufs: z.array(z.enum(UFS)).max(27).optional(),
})
export type PedidoDaJornada = z.infer<typeof pedidoDaJornadaSchema>

export interface EstadoDaJornada extends PedidoDaJornada {
  atualizadoEm: string
  /** "Agora não": volta a oferecer depois deste instante. */
  adiadaAte?: string
}

const DIA = 24 * 60 * 60 * 1000

/** Lê o JSON do banco com tolerância: qualquer coisa estranha vira "não começou". */
export function lerEstadoDaJornada(bruto: unknown): EstadoDaJornada | null {
  if (!bruto || typeof bruto !== 'object') return null
  const r = pedidoDaJornadaSchema.safeParse(bruto)
  if (!r.success) return null
  const b = bruto as Record<string, unknown>
  return {
    ...r.data,
    atualizadoEm: typeof b.atualizadoEm === 'string' ? b.atualizadoEm : new Date(0).toISOString(),
    ...(typeof b.adiadaAte === 'string' ? { adiadaAte: b.adiadaAte } : {}),
  }
}

/** O novo estado a gravar: "Agora não" adia por um dia; as outras fases guardam o que veio. */
export function novoEstadoDaJornada(pedido: PedidoDaJornada, anterior: EstadoDaJornada | null, agora: Date = new Date()): EstadoDaJornada {
  return {
    fase: pedido.fase,
    termo: pedido.termo ?? anterior?.termo,
    ufs: pedido.ufs ?? anterior?.ufs,
    atualizadoEm: agora.toISOString(),
    ...(pedido.fase === 'adiada' ? { adiadaAte: new Date(agora.getTime() + DIA).toISOString() } : {}),
  }
}

/**
 * A Bela abre sozinha só para quem está no teste e ainda não terminou nem
 * recusou. Quem disse "agora não" vê de novo no dia seguinte. Quem já está no
 * meio continua de onde parou.
 */
export function deveOferecerAJornada(planCode: string, estado: EstadoDaJornada | null, agora: Date = new Date()): boolean {
  if (planCode !== PLANO_DE_TESTE) return false
  if (!estado) return true
  if (estado.fase === 'recusada' || estado.fase === 'etapa1Feita') return false
  if (estado.fase === 'adiada') return !estado.adiadaAte || new Date(estado.adiadaAte).getTime() <= agora.getTime()
  return true
}
