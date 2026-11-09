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
  // Mais provedores comuns de caixa temporária (lista ampliada em 11/2026).
  'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'grr.la', 'pokemail.net', 'spam4.me', 'yopmail.fr',
  'cool.fr.nf', 'jetable.fr.nf', 'mailinator.net', 'mailinator2.com', 'trbvm.com', 'mailcatch.com', 'mailpoof.com',
  'tempmailo.com', 'tempmail.dev', 'tempmail.plus', 'temp-mail.lol', 'tempmailaddress.com', 'emailtemporario.com.br',
  'emailtemporal.org', 'minuteinbox.com', '20minutemail.com', '33mail.com', 'dropmail.me', 'emltmp.com', 'spymail.one',
  'mailsac.com', 'harakirimail.com', 'anonaddy.me', 'byom.de', 'wegwerfmail.de', 'einrot.com', 'mvrht.com',
  'owlymail.com', 'tempail.com', 'fexbox.org', 'rootfest.net', 'mailto.plus', 'firemailbox.club', 'vomoto.com',
  'getairmail.com', 'inboxbear.com', 'smailpro.com', 'kukook.com', 'gufum.com', 'tmails.net', 'mail7.io',
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

// Situações da Receita em que o CNPJ não pode abrir teste (a empresa não existe mais
// ou está irregular). "ATIVA" passa; situação desconhecida também passa.
const SITUACOES_QUE_BLOQUEIAM = ['BAIXADA', 'INAPTA', 'SUSPENSA', 'NULA']

export function situacaoBloqueiaCadastro(situacao: string | null | undefined): boolean {
  const s = (situacao ?? '').trim().toUpperCase()
  return SITUACOES_QUE_BLOQUEIAM.includes(s)
}

// A consulta à Receita só roda em produção (testes e desenvolvimento não dependem da
// BrasilAPI). CADASTRO_CONSULTA_RECEITA="false" desliga; "true" liga fora de produção.
export function consultaReceitaLigada(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CADASTRO_CONSULTA_RECEITA?.trim().toLowerCase()
  if (v === 'false') return false
  if (v === 'true') return true
  return env.NODE_ENV === 'production'
}

// Vários testes do mesmo endereço de internet em pouco tempo costumam ser a mesma
// pessoa com documentos diferentes. Não bloqueia (escritório e internet de celular
// dividem endereço): só avisa o administrador a partir do 3º teste em 30 dias.
export const JANELA_MESMO_IP_DIAS = 30
export const AVISAR_A_PARTIR_DE = 3

export function avisarMesmoIp(cadastrosNaJanela: number): boolean {
  return cadastrosNaJanela >= AVISAR_A_PARTIR_DE
}
