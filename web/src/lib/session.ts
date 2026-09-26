// ============================================================
// lib/session.ts — Sessão via token (JWT) + dados do usuário logado
// ============================================================

const TOKEN_KEY = 'licitacao-platform:token'
const USER_KEY = 'licitacao-platform:user'

export interface SessionUser {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export function setSession(token: string, user: SessionUser) {
  window.localStorage.setItem(TOKEN_KEY, token)
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// Trocar a senha reemite o token (o antigo é revogado no servidor) — sem
// regravar aqui, a sessão morreria na próxima requisição.
export function replaceSessionToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Navegador com armazenamento bloqueado: a sessão atual segue em memória
    // até o próximo carregamento de página.
  }
}

export function clearSessionUser() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
}
