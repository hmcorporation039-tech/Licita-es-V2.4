// ============================================================
// lib/api.ts — Cliente HTTP para a API REST da plataforma
// ============================================================

import { clearSessionUser, getSessionToken } from './session'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

export class ApiRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    // Sessão inválida/expirada — limpa e manda pro login, exceto se a
    // própria tentativa de login que falhou (senão criaria um loop).
    if (res.status === 401 && !path.startsWith('/api/auth/login') && typeof window !== 'undefined') {
      clearSessionUser()
      window.location.href = '/login'
    }
    const detail =
      Array.isArray(body.details) && body.details.length > 0
        ? ' (' + body.details.map((d: { path?: unknown[]; message?: string }) => `${(d.path ?? []).join('.')}: ${d.message}`).join('; ') + ')'
        : ''
    throw new ApiRequestError(res.status, (body.error ?? `Erro ${res.status}`) + detail)
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined }),
}
