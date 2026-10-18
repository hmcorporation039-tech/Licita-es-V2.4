// ============================================================
// lib/api.ts — Cliente HTTP para a API REST da plataforma
// ============================================================

import { clearSessionUser, getSessionToken } from './session'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

export const CODIGO_ACESSO_EXPIRADO = 'ACESSO_EXPIRADO'
export const PAGINA_DE_ACESSO_ENCERRADO = '/acesso-encerrado'

export class ApiRequestError extends Error {
  status: number
  code?: string
  campos: Record<string, string>
  detalhes: Record<string, unknown>
  constructor(status: number, message: string, code?: string, campos: Record<string, string> = {}, detalhes: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.campos = campos
    this.detalhes = detalhes
  }
}

const CHAVE_DO_ACESSO_ENCERRADO = 'licitacao-platform:acesso-encerrado'

function guardarAcessoEncerrado(dados: Record<string, unknown>) {
  try {
    window.sessionStorage.setItem(CHAVE_DO_ACESSO_ENCERRADO, JSON.stringify(dados))
  } catch {}
}

export function lerAcessoEncerradoGuardado(): Record<string, unknown> {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_DO_ACESSO_ENCERRADO)
    const dados: unknown = bruto ? JSON.parse(bruto) : null
    return dados && typeof dados === 'object' ? (dados as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function ehTelaDeEntrada(path: string): boolean {
  return path.startsWith('/api/auth/login') || path.startsWith('/api/auth/acesso-encerrado')
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
    if (res.status === 401 && !ehTelaDeEntrada(path) && typeof window !== 'undefined') {
      clearSessionUser()
      window.location.href = '/login'
    }
    if (res.status === 403 && body.code === CODIGO_ACESSO_EXPIRADO && !ehTelaDeEntrada(path) && typeof window !== 'undefined') {
      clearSessionUser()
      guardarAcessoEncerrado({ acessoAte: body.acessoAte, emTeste: body.emTeste })
      window.location.href = PAGINA_DE_ACESSO_ENCERRADO
    }
    const detalhes: DetalheDeValidacao[] = Array.isArray(body.details) ? body.details : []
    const mensagens = [...new Set(detalhes.map((d) => d.message).filter((m): m is string => Boolean(m)))]
    const mensagem = mensagens.length > 0 ? mensagens.join('. ') : (body.error ?? `Erro ${res.status}`)
    throw new ApiRequestError(res.status, mensagem, typeof body.code === 'string' ? body.code : undefined, camposComErro(detalhes), body)
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

export async function buscarArquivo(path: string): Promise<Blob> {
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

export async function baixarArquivoPost(path: string, corpo: unknown, nomeSugerido: string): Promise<void> {
  const token = getSessionToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiRequestError(res.status, body.error ?? `Erro ${res.status}`)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nomeSugerido
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
