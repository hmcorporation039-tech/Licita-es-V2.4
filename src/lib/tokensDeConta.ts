// ============================================================
// lib/tokensDeConta.ts — Tokens de uso único (confirmar e-mail, recuperar
// senha). O token em claro só existe no link enviado por e-mail; no banco vai
// apenas o SHA-256. Token aleatório de 256 bits não precisa de sal nem de
// comparação em tempo constante (a busca é pelo hash).
// ============================================================

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

// EMAIL_CODE: código de 6 dígitos que confirma o e-mail no cadastro (EMAIL_VERIFY, o link, não é mais emitido).
export const TIPOS_DE_TOKEN = ['EMAIL_VERIFY', 'EMAIL_CODE', 'PASSWORD_RESET'] as const
export type TipoDeToken = (typeof TIPOS_DE_TOKEN)[number]

// Validade de cada tipo, em milissegundos.
export const VALIDADE_DO_TOKEN: Record<TipoDeToken, number> = {
  EMAIL_VERIFY: 48 * 60 * 60 * 1000,
  EMAIL_CODE: 15 * 60 * 1000,
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

// ---------- Código de confirmação de e-mail (6 dígitos) ----------
// Só o HMAC do código vai ao banco (nunca o código em claro). Como são só 1 milhão de
// combinações, o HMAC usa o segredo do servidor + o id da conta: quem lê o banco não
// consegue testar códigos offline sem o segredo. O ataque online é barrado por tentativas.
export const MAX_TENTATIVAS_DO_CODIGO = 5

export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashDoCodigo(codigo: string, userId: string, segredo: string = process.env.JWT_SECRET ?? ''): string {
  return createHmac('sha256', segredo).update(`${userId}:${codigo}`).digest('hex')
}

export function codigoConfere(informado: string, userId: string, hashGravado: string): boolean {
  const a = Buffer.from(hashDoCodigo(informado, userId), 'hex')
  const b = Buffer.from(hashGravado, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
