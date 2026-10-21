import type { NextRequest } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'
const TAMANHO_MAXIMO_DO_TOKEN = 300

export function GET(request: NextRequest) {
  const destino = new URL('/descadastro', request.nextUrl)
  const token = request.nextUrl.searchParams.get('t')
  if (token) destino.searchParams.set('t', token)
  return Response.redirect(destino, 303)
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? ''
  if (!token || token.length > TAMANHO_MAXIMO_DO_TOKEN) {
    return Response.json({ error: 'Link de descadastro inválido.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const resposta = await fetch(`${API_URL}/api/descadastro/um-clique?t=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const corpo = await resposta.json().catch(() => ({}))
    return Response.json(corpo, { status: resposta.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Descadastro indisponível no momento.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
