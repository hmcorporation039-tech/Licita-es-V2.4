// ============================================================
// lib/protecaoCadastro.ts — Barreiras contra cadastro automatizado (cada conta de
// teste consome análises pagas). Todas opcionais/configuráveis:
//   TURNSTILE_SECRET_KEY      liga o captcha Cloudflare Turnstile no /register
//                             (o site usa NEXT_PUBLIC_TURNSTILE_SITE_KEY)
//   CADASTRO_MAX_POR_HORA     teto global de cadastros novos por hora (padrão 60)
// E-mails de domínios descartáveis (temporários) são sempre recusados.
// ============================================================

// Os provedores de e-mail temporário mais usados para criar contas em série.
const DESCARTAVEIS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'throwawaymail.com', 'yopmail.com', 'yopmail.net',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'trashmail.com', 'trashmail.net',
  'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempinbox.com', 'spamgourmet.com', 'mytemp.email',
  'moakt.com', 'tempr.email', 'discard.email', 'burnermail.io', 'inboxkitten.com', 'emailfake.com', 'fakemail.net',
  'mail.tm', 'mail.gw', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'linshiyouxiang.net', 'crazymailing.com', 'luxusmail.org',
])

export function emailDescartavel(email: string): boolean {
  const dominio = email.trim().toLowerCase().split('@')[1] ?? ''
  if (!dominio) return false
  // Pega subdomínios também (ex.: abc.mailinator.com).
  return [...DESCARTAVEIS].some((d) => dominio === d || dominio.endsWith('.' + d))
}

export function maxCadastrosPorHora(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CADASTRO_MAX_POR_HORA)
  return Number.isInteger(n) && n > 0 ? n : 60
}

export type VerificadorHttp = (url: string, corpo: URLSearchParams) => Promise<{ success?: boolean }>

const verificadorPadrao: VerificadorHttp = async (url, corpo) => {
  const r = await fetch(url, { method: 'POST', body: corpo, signal: AbortSignal.timeout(8000) })
  return (await r.json()) as { success?: boolean }
}

// true = humano confirmado (ou captcha desligado). Falha de rede do Cloudflare NÃO
// libera: sem captcha válido não há cadastro enquanto ele estiver ligado.
export async function captchaValido(
  resposta: string | undefined,
  ip: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  verificar: VerificadorHttp = verificadorPadrao
): Promise<boolean> {
  const segredo = env.TURNSTILE_SECRET_KEY?.trim()
  if (!segredo) return true
  if (!resposta) return false
  try {
    const corpo = new URLSearchParams({ secret: segredo, response: resposta, ...(ip ? { remoteip: ip } : {}) })
    const r = await verificar('https://challenges.cloudflare.com/turnstile/v0/siteverify', corpo)
    return r.success === true
  } catch {
    return false
  }
}
