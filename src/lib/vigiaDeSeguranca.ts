export type Severidade = 'critico' | 'atencao' | 'ok'

export type ClasseDeEndereco = 'interno' | 'externo' | 'invalido'

const PREFIXOS_PRIVADOS_V4 = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

export function normalizarEndereco(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  const primeiro = bruto.split(',')[0]?.trim()
  if (!primeiro) return null
  const semColchete = primeiro.startsWith('[')
    ? primeiro.slice(1, primeiro.indexOf(']') === -1 ? undefined : primeiro.indexOf(']'))
    : primeiro
  if (semColchete.includes(':') && semColchete.split(':').length === 2 && semColchete.indexOf('.') !== -1) {
    return semColchete.split(':')[0]
  }
  const semMascara = semColchete.split('/')[0]
  return semMascara.toLowerCase()
}

export function classificarEndereco(bruto: string | null | undefined): ClasseDeEndereco {
  const ip = normalizarEndereco(bruto)
  if (!ip) return 'invalido'
  if (ip.includes('.')) {
    const partes = ip.split('.')
    if (partes.length !== 4 || partes.some((p) => p === '' || Number.isNaN(Number(p)) || Number(p) > 255)) {
      return 'invalido'
    }
    return PREFIXOS_PRIVADOS_V4.some((re) => re.test(ip)) ? 'interno' : 'externo'
  }
  if (ip === '::1') return 'interno'
  if (ip.startsWith('fc') || ip.startsWith('fd')) return 'interno'
  if (ip.startsWith('fe80')) return 'interno'
  if (ip.includes(':')) return 'externo'
  return 'invalido'
}

export function severidadeGeral(achados: ReadonlyArray<{ severidade: Severidade }>): Severidade {
  if (achados.some((a) => a.severidade === 'critico')) return 'critico'
  if (achados.some((a) => a.severidade === 'atencao')) return 'atencao'
  return 'ok'
}

export function contarPorChave<T>(itens: ReadonlyArray<T>, chave: (item: T) => string | null): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    const k = chave(item)
    if (k === null) continue
    mapa.set(k, (mapa.get(k) ?? 0) + 1)
  }
  return mapa
}

export function ipsComMuitasFalhas(
  falhas: ReadonlyArray<{ ip: string | null }>,
  limite: number,
): Array<{ ip: string; total: number }> {
  const contagem = contarPorChave(falhas, (f) => normalizarEndereco(f.ip))
  return [...contagem.entries()]
    .filter(([, total]) => total >= limite)
    .map(([ip, total]) => ({ ip, total }))
    .sort((a, b) => b.total - a.total)
}

export function alvosComMuitasFalhas(
  falhas: ReadonlyArray<{ email: string | null }>,
  limite: number,
): Array<{ email: string; total: number }> {
  const contagem = contarPorChave(falhas, (f) => (f.email ? f.email.toLowerCase() : null))
  return [...contagem.entries()]
    .filter(([, total]) => total >= limite)
    .map(([email, total]) => ({ email, total }))
    .sort((a, b) => b.total - a.total)
}

export function enderecosNovosPorAtor(
  loginsNaJanela: ReadonlyArray<{ email: string | null; ip: string | null }>,
  enderecosConhecidos: ReadonlySet<string>,
): Array<{ email: string; ip: string }> {
  const vistos = new Set<string>()
  const novos: Array<{ email: string; ip: string }> = []
  for (const login of loginsNaJanela) {
    const ip = normalizarEndereco(login.ip)
    const email = login.email?.toLowerCase()
    if (!ip || !email) continue
    const chave = `${email}|${ip}`
    if (vistos.has(chave) || enderecosConhecidos.has(chave)) continue
    vistos.add(chave)
    novos.push({ email, ip })
  }
  return novos
}

export function houveSalto(atual: number, anterior: number, fatorMinimo: number, pisoAbsoluto: number): boolean {
  if (atual < pisoAbsoluto) return false
  if (anterior === 0) return atual >= pisoAbsoluto
  return atual >= anterior * fatorMinimo
}
