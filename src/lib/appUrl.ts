// ============================================================
// lib/appUrl.ts — Endereço público do site (para montar os links enviados por
// e-mail). Vem de APP_URL; na falta dela, usa a primeira origem de CORS_ORIGINS
// (que em produção já é o endereço do site).
// ============================================================

export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicita = env.APP_URL?.trim()
  const primeiraOrigem = (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).find(Boolean)
  return (explicita || primeiraOrigem || 'http://localhost:3000').replace(/\/+$/, '')
}
