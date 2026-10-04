// ============================================================
// lib/tokensDeConta.ts — Tokens de uso único (confirmar e-mail, recuperar
// senha). O token em claro só existe no link enviado por e-mail; no banco vai
// apenas o SHA-256. Token aleatório de 256 bits não precisa de sal nem de
// comparação em tempo constante (a busca é pelo hash).
// ============================================================

import { createHash, randomBytes } from 'node:crypto'

export const TIPOS_DE_TOKEN = ['EMAIL_VERIFY', 'PASSWORD_RESET'] as const
export type TipoDeToken = (typeof TIPOS_DE_TOKEN)[number]

// Validade de cada tipo, em milissegundos.
export const VALIDADE_DO_TOKEN: Record<TipoDeToken, number> = {
  EMAIL_VERIFY: 48 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
}

// Intervalo mínimo entre dois e-mails do mesmo tipo para a mesma conta.
export const INTERVALO_ENTRE_ENVIOS_MS = 60 * 1000

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashDoToken(token) }
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenUtilizavel(
  t: { usedAt: Date | null; expiresAt: Date } | null | undefined,
  agora: Date = new Date()
): boolean {
  return !!t && t.usedAt === null && t.expiresAt.getTime() > agora.getTime()
}
