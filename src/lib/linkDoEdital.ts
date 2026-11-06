// ============================================================
// lib/linkDoEdital.ts — O link "abrir edital" de uma licitação do PNCP.
//
// O PNCP repassa o que o órgão digitou em linkSistemaOrigem: às vezes sem
// "https://" ("contratosgov.com.br/..."), às vezes um e-mail ou um espaço. Sem
// link válido, a própria página do edital no PNCP serve (montada a partir do
// número de controle "CNPJ-1-SEQ/ANO").
// ============================================================

import { safeHttpUrl } from './html'

function comoUrl(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const t = valor.trim()
  if (!t || /\s/.test(t)) return null
  if (/^https?:\/\//i.test(t)) return safeHttpUrl(t)
  // Só endereço com cara de domínio ("site.com.br/caminho"); e-mail e texto solto, não.
  if (!t.includes('@') && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|$)/i.test(t)) return safeHttpUrl(`https://${t}`)
  return null
}

export function paginaDoEditalNoPncp(numeroControle: string | null | undefined): string | null {
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec((numeroControle ?? '').trim())
  if (!m) return null
  return `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}`
}

export function linkDoEditalPncp(linkSistemaOrigem: unknown, linkEdital: unknown, numeroControle: string | null | undefined): string | undefined {
  return comoUrl(linkSistemaOrigem) ?? comoUrl(linkEdital) ?? paginaDoEditalNoPncp(numeroControle) ?? undefined
}
