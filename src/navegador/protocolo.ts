// ============================================================
// navegador/protocolo.ts — Mensagens entre a página da Bela (web) e o serviço navegador,
// pelo WebSocket. Texto = JSON (abaixo). Binário do servidor para a web = um quadro JPEG
// da tela. Tudo que chega da web é validado aqui antes de virar ação no navegador.
// ============================================================

import { z } from 'zod'

export const LARGURA_PADRAO = 1366
export const ALTURA_PADRAO = 768
export const MAX_ARQUIVO_BYTES = 20 * 1024 * 1024

const coord = z.number().finite().min(0).max(4000)
const modificadores = z.number().int().min(0).max(15).default(0) // Alt=1, Ctrl=2, Meta=4, Shift=8 (como no CDP)

export const mensagemDaWeb = z.discriminatedUnion('t', [
  z.object({ t: z.literal('entrar'), token: z.string().min(10).max(4000), tenderId: z.string().uuid(), portal: z.string().max(40).optional() }),
  z.object({ t: z.literal('tamanho'), largura: z.number().int().min(800).max(1920), altura: z.number().int().min(500).max(1200) }),
  z.object({
    t: z.literal('mouse'),
    tipo: z.enum(['mover', 'descer', 'subir']),
    x: coord,
    y: coord,
    botao: z.enum(['left', 'middle', 'right']).default('left'),
    cliques: z.number().int().min(1).max(3).default(1),
  }),
  z.object({ t: z.literal('rolar'), x: coord, y: coord, dx: z.number().finite().min(-5000).max(5000), dy: z.number().finite().min(-5000).max(5000) }),
  z.object({ t: z.literal('tecla'), tipo: z.enum(['descer', 'subir']), tecla: z.string().min(1).max(32), modificadores }),
  z.object({ t: z.literal('texto'), texto: z.string().min(1).max(5000) }),
  z.object({ t: z.literal('navegar'), acao: z.enum(['voltar', 'avancar', 'recarregar', 'inicio']) }),
  z.object({ t: z.literal('ir'), url: z.string().url().max(2000) }),
  z.object({ t: z.literal('preencher-lance'), valor: z.number().positive().max(1e13) }),
  z.object({ t: z.literal('preencher-login') }),
  z.object({
    t: z.literal('arquivos'),
    arquivos: z
      .array(z.object({ nome: z.string().min(1).max(200), tipo: z.string().max(120).default('application/octet-stream'), base64: z.string().max(Math.ceil((MAX_ARQUIVO_BYTES * 4) / 3) + 8) }))
      .max(10),
  }),
  z.object({ t: z.literal('dialogo'), aceitar: z.boolean(), texto: z.string().max(2000).optional() }),
  z.object({ t: z.literal('encerrar') }),
  z.object({ t: z.literal('ping') }),
])

export type MensagemDaWeb = z.infer<typeof mensagemDaWeb>

export type MensagemDoNavegador =
  | { t: 'pronto'; largura: number; altura: number; portal: string; nomeDoPortal: string }
  | { t: 'estado'; url: string; titulo: string; host: string; portal: string | null; recusado: number | null }
  | { t: 'leitura'; melhorLance: number | null; mensagensNovas: number }
  | { t: 'lance-preenchido'; ok: boolean; texto?: string; motivo?: string }
  | { t: 'login-preenchido'; ok: boolean; mensagem: string }
  | { t: 'pedido-de-arquivo'; multiplo: boolean }
  | { t: 'download'; nome: string; tipo: string; base64: string }
  | { t: 'dialogo'; tipo: string; mensagem: string; padrao: string }
  | { t: 'bloqueado'; url: string; motivo: string }
  | { t: 'aviso'; mensagem: string }
  | { t: 'erro'; codigo: string; mensagem: string }
  | { t: 'encerrada'; motivo: string }
  | { t: 'pong' }

/**
 * Para onde a página principal pode navegar, sempre em https: os portais do governo
 * (gov.br, inclusive o login do gov.br) e os portais de compras de Meus Portais.
 * (Imagens, scripts e o CAPTCHA de outros domínios carregam normalmente; o que se
 * limita é a navegação, para o navegador da Bela não virar um navegador qualquer.)
 */
export function navegacaoPermitida(url: string, hostsLocais: string[] = [], hostsDosPortais: string[] = []): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'about:' || u.protocol === 'data:' || u.protocol === 'blob:') return true
  const host = u.hostname.toLowerCase()
  // Só para teste/desenvolvimento: hosts locais liberados em http (NAVEGADOR_HOSTS_LOCAIS).
  if (hostsLocais.includes(host) && (u.protocol === 'http:' || u.protocol === 'https:')) return true
  if (u.protocol !== 'https:') return false
  if (host === 'gov.br' || host.endsWith('.gov.br')) return true
  return hostsDosPortais.some((d) => host === d || host.endsWith('.' + d))
}

/**
 * Respostas HTTP com que um portal recusa o acesso em si (não é a tela de login): 403 de
 * bloqueio por país/IP, 429 de excesso de acessos e 451 de bloqueio legal.
 */
export function statusDeRecusa(status: number): boolean {
  return status === 403 || status === 429 || status === 451
}

/** Tecla vinda do navegador da pessoa -> nome que o Playwright entende. */
export function teclaParaPlaywright(tecla: string): string | null {
  const especiais: Record<string, string> = {
    ' ': 'Space',
    Esc: 'Escape',
    Del: 'Delete',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Control: 'Control',
    Ctrl: 'Control',
    OS: 'Meta',
  }
  if (especiais[tecla]) return especiais[tecla]
  if (tecla.length === 1) return tecla
  // Nomes como Enter, Tab, Backspace, ArrowLeft, F5, Home, PageDown, Shift, Alt, Meta.
  return /^[A-Z][A-Za-z0-9]{1,15}$/.test(tecla) ? tecla : null
}
