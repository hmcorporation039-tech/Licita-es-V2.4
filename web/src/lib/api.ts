// ============================================================
// lib/api.ts — Cliente HTTP para a API REST da plataforma
// ============================================================

import { clearSessionUser, getSessionToken } from './session'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

export class ApiRequestError extends Error {
  status: number
  code?: string
  campos: Record<string, string>
  constructor(status: number, message: string, code?: string, campos: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.campos = campos
  }
}

interface DetalheDeValidacao {
  path?: unknown[]
  message?: string
}

function camposComErro(detalhes: DetalheDeValidacao[]): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const d of detalhes) {
    const campo = String(d.path?.[0] ?? '')
    if (campo && d.message && !campos[campo]) campos[campo] = d.message
  }
  return campos
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
    const detalhes: DetalheDeValidacao[] = Array.isArray(body.details) ? body.details : []
    const mensagens = [...new Set(detalhes.map((d) => d.message).filter((m): m is string => Boolean(m)))]
    const mensagem = mensagens.length > 0 ? mensagens.join('. ') : (body.error ?? `Erro ${res.status}`)
    throw new ApiRequestError(res.status, mensagem, typeof body.code === 'string' ? body.code : undefined, camposComErro(detalhes))
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

async function buscarArquivo(path: string): Promise<Blob> {
  const token = getSessionToken()
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiRequestError(res.status, body.error ?? `Erro ${res.status}`)
  }
  return res.blob()
}

export async function baixarArquivo(path: string, nomeSugerido: string): Promise<void> {
  const url = URL.createObjectURL(await buscarArquivo(path))
  const a = document.createElement('a')
  a.href = url
  a.download = nomeSugerido
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function abrirArquivo(path: string): Promise<void> {
  const janela = window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await buscarArquivo(path))
    if (janela) janela.location.href = url
    else window.location.assign(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    janela?.close()
    throw err
  }
}

export async function enviarArquivo<T>(path: string, arquivo: File): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': arquivo.type || 'application/octet-stream',
      'X-Nome-Arquivo': encodeURIComponent(arquivo.name),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: arquivo,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const mensagem = res.status === 413 ? 'O arquivo passa de 10 MB. Envie um arquivo menor.' : (body.error ?? `Erro ${res.status}`)
    throw new ApiRequestError(res.status, mensagem)
  }
  return body as T
}
