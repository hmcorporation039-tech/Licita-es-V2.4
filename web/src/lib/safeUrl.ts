// ============================================================
// lib/safeUrl.ts — Valida uma URL vinda de dado externo (ex.: linkEdital,
// que é raspado de sites de terceiros) antes de usá-la num href.
// Só aceita http(s); rejeita javascript:, data:, etc. — que num href
// poderiam executar script no clique.
// ============================================================

export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return null
  } catch {
    return null
  }
}

// Página do edital no PNCP, a partir do número de controle "CNPJ-1-SEQ/ANO".
// Serve quando o órgão não informou um link válido (mesma regra de src/lib/linkDoEdital.ts).
export function paginaDoEditalNoPncp(numeroControle: string | null | undefined): string | null {
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec((numeroControle ?? '').trim())
  if (!m) return null
  return `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}`
}
