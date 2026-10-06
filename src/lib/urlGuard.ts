// ============================================================
// lib/urlGuard.ts — Defesa contra SSRF nos downloads de anexos de edital.
//
// As URLs de anexo vêm de HTML/JSON de terceiros (PNCP, Novacap, SESC-GO).
// Sem trava, um link malicioso (ou uma fonte comprometida) faria o servidor
// acessar a rede interna da infraestrutura — ex.: http://169.254.169.254 (metadata
// de nuvem) ou http://redis.railway.internal:6379. Aqui garantimos que:
//   1. o protocolo é https;
//   2. o host pertence a uma das fontes conhecidas (allowlist por sufixo);
//   3. NENHUM IP resolvido é privado/reservado — checado na hora de abrir a
//      conexão (o `lookup` do agente roda em cada hop, então cobre também
//      redirects e DNS rebinding).
// ============================================================

import { Agent as HttpsAgent } from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import type { LookupFunction } from 'node:net'

// Sufixos de host aceitos. Só as fontes de onde a plataforma realmente baixa
// anexo (ver pncpDocumentsService.downloadPNCPDocument e quem o chama).
const HOSTS_PERMITIDOS = ['pncp.gov.br', 'novacap.df.gov.br', 'sescgo.com.br']

export function hostPermitido(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return HOSTS_PERMITIDOS.some((sufixo) => h === sufixo || h.endsWith('.' + sufixo))
}

// Valida a URL antes de qualquer requisição. Lança em caso de URL inválida,
// protocolo diferente de https ou host fora da allowlist.
export function assertUrlDownloadPermitida(uri: string): URL {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    throw new Error('URL de anexo inválida')
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Protocolo não permitido para download: ${url.protocol}`)
  }
  if (!hostPermitido(url.hostname)) {
    throw new Error(`Host não permitido para download: ${url.hostname}`)
  }
  return url
}

// IPs que nunca devem ser alvo de um download vindo de link externo: loopback,
// redes privadas (RFC 1918), link-local (inclui o 169.254.169.254 de metadata
// de nuvem), CGNAT, faixas de teste/benchmark/reservadas e os equivalentes IPv6 —
// inclusive IPv4 embutido em IPv6 (::ffff:a00:1, 64:ff9b::a00:1), que desviava a regra antiga.
function ipv4Reservado(b: number[]): boolean {
  const [a, c] = b
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && c === 254) return true
  if (a === 172 && c >= 16 && c <= 31) return true
  if (a === 192 && c === 168) return true
  if (a === 100 && c >= 64 && c <= 127) return true // CGNAT
  if (a === 198 && (c === 18 || c === 19)) return true // benchmark 198.18.0.0/15
  if (a === 192 && c === 0 && b[2] === 0) return true // 192.0.0.0/24
  if (a === 192 && c === 0 && b[2] === 2) return true // documentação
  if (a === 198 && c === 51 && b[2] === 100) return true // documentação
  if (a === 203 && c === 0 && b[2] === 113) return true // documentação
  if (a >= 224) return true // multicast e reservado (inclui 255.255.255.255)
  return false
}

// IPv6 -> 16 bytes (aceita "::" e IPv4 pontuado no final). null se não for IPv6 válido.
function ipv6ParaBytes(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const zona = v.indexOf('%')
  if (zona >= 0) v = v.slice(0, zona)
  const ponto = v.lastIndexOf('.')
  if (ponto >= 0) {
    const doisPontos = v.lastIndexOf(':')
    const q = v.slice(doisPontos + 1).split('.').map(Number)
    if (q.length !== 4 || q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    v = v.slice(0, doisPontos + 1) + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16)
  }
  const partes = v.split('::')
  if (partes.length > 2) return null
  const lado = (t: string) => (t === '' ? [] : t.split(':'))
  const esq = lado(partes[0])
  const dir = partes.length === 2 ? lado(partes[1]) : []
  const falta = 8 - esq.length - dir.length
  if ((partes.length === 1 && falta !== 0) || falta < 0 || (partes.length === 2 && falta < 1)) return null
  const grupos = [...esq, ...Array(partes.length === 2 ? falta : 0).fill('0'), ...dir]
  if (grupos.length !== 8) return null
  const bytes: number[] = []
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    const n = parseInt(g, 16)
    bytes.push(n >> 8, n & 255)
  }
  return bytes
}

export function isIpPrivadoOuReservado(ip: string): boolean {
  const tipo = net.isIP(ip.replace(/^\[|\]$/g, ''))
  if (tipo === 4) return ipv4Reservado(ip.split('.').map(Number))
  if (tipo === 6) {
    const b = ipv6ParaBytes(ip)
    if (!b) return true
    const zerosAte = (n: number) => b.slice(0, n).every((x) => x === 0)
    if (zerosAte(15) && (b[15] === 0 || b[15] === 1)) return true // :: e ::1
    if (zerosAte(10) && b[10] === 255 && b[11] === 255) return ipv4Reservado(b.slice(12)) // ::ffff:a.b.c.d (qualquer notação)
    if (zerosAte(12)) return true // ::a.b.c.d (IPv4 compatível, obsoleto)
    if (b[0] === 0 && b[1] === 100 && b[2] === 255 && b[3] === 155 && b.slice(4, 12).every((x) => x === 0)) return ipv4Reservado(b.slice(12)) // 64:ff9b::/96 (NAT64)
    if (b[0] === 1 && b[1] === 0 && b.slice(2, 8).every((x) => x === 0)) return true // 100::/64 descarte
    if ((b[0] & 0xfe) === 0xfc) return true // fc00::/7 (ULA)
    if (b[0] === 0xfe && (b[1] & 0xc0) >= 0x80) return true // fe80::/10 link-local e fec0::/10 site-local
    if (b[0] === 0xff) return true // multicast
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // 2001:db8::/32 documentação
    return false
  }
  return true // não é IP reconhecível: rejeita por precaução
}

// lookup que recusa a conexão se o nome resolver para um IP privado/reservado.
// Passado ao agente https, roda a cada abertura de socket — inclusive nos
// redirects seguidos internamente e em tentativas de DNS rebinding.
const lookupSeguro: LookupFunction = (hostname, options, callback) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dns.lookup(hostname, options as any, (err, address, family) => {
    if (err) return callback(err, address as string, family as number)
    const enderecos = Array.isArray(address)
      ? (address as unknown as { address: string }[]).map((a) => a.address)
      : [address as string]
    for (const ip of enderecos) {
      if (isIpPrivadoOuReservado(ip)) {
        return callback(new Error(`Destino bloqueado (IP interno): ${ip}`), '', 0)
      }
    }
    callback(null, address as string, family as number)
  })
}

// Agente https reutilizável que aplica o lookupSeguro em toda conexão.
export const agenteDownloadSeguro = new HttpsAgent({ lookup: lookupSeguro })
