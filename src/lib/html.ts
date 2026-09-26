// ============================================================
// lib/html.ts — Escape de texto interpolado em corpo de e-mail.
// ============================================================

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/[&<>"']/g, (char) => ENTIDADES[char])
}

// Só admite http(s) — evita que um link vindo da fonte externa vire
// javascript: dentro do e-mail.
export function safeHttpUrl(valor: string | null | undefined): string | null {
  if (!valor) return null
  try {
    const url = new URL(valor)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}
