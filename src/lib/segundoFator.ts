import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const PERIODO_DO_CODIGO_S = 30
export const PASSOS_DE_TOLERANCIA = 1
export const QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO = 8
export const VALIDADE_DA_CONFIRMACAO_MS = 15 * 60 * 1000
export const EMISSOR = 'Licita Bela'

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const ALFABETO_DE_RECUPERACAO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function base32(bytes: Buffer): string {
  let bits = 0
  let valor = 0
  let saida = ''
  for (const byte of bytes) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31]
  return saida
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let valor = 0
  const bytes: number[] = []
  for (const letra of limpo) {
    const indice = ALFABETO_BASE32.indexOf(letra)
    if (indice < 0) throw new Error('Segredo em base32 inválido')
    valor = (valor << 5) | indice
    bits += 5
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function gerarSegredo(): string {
  return base32(randomBytes(20))
}

export function passoDoMomento(agora: Date): number {
  return Math.floor(agora.getTime() / 1000 / PERIODO_DO_CODIGO_S)
}

export function codigoDoPasso(segredo: Buffer, passo: number, digitos = 6): string {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(passo))
  const hmac = createHmac('sha1', segredo).update(contador).digest()
  const inicio = hmac[hmac.length - 1] & 15
  const numero = hmac.readUInt32BE(inicio) & 0x7fffffff
  return String(numero % 10 ** digitos).padStart(digitos, '0')
}

export function apenasDigitos(codigo: string): string {
  return codigo.replace(/\s/g, '')
}

export function passoDoCodigoValido(segredoBase32: string, codigoDigitado: string, agora: Date, ultimoPassoUsado: number | null): number | null {
  const codigo = apenasDigitos(codigoDigitado)
  if (!/^\d{6}$/.test(codigo)) return null
  const segredo = deBase32(segredoBase32)
  const atual = passoDoMomento(agora)
  for (let desvio = -PASSOS_DE_TOLERANCIA; desvio <= PASSOS_DE_TOLERANCIA; desvio++) {
    const passo = atual + desvio
    if (ultimoPassoUsado !== null && passo <= ultimoPassoUsado) continue
    if (timingSafeEqual(Buffer.from(codigoDoPasso(segredo, passo)), Buffer.from(codigo))) return passo
  }
  return null
}

export function enderecoDoAutenticador(email: string, segredoBase32: string): string {
  const rotulo = encodeURIComponent(`${EMISSOR}:${email}`)
  const parametros = new URLSearchParams({ secret: segredoBase32, issuer: EMISSOR, algorithm: 'SHA1', digits: '6', period: String(PERIODO_DO_CODIGO_S) })
  return `otpauth://totp/${rotulo}?${parametros.toString().replace(/\+/g, '%20')}`
}

export function segredoAgrupado(segredoBase32: string): string {
  return segredoBase32.match(/.{1,4}/g)?.join(' ') ?? segredoBase32
}

export function gerarCodigosDeRecuperacao(quantidade = QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO): string[] {
  const codigos = new Set<string>()
  while (codigos.size < quantidade) {
    let texto = ''
    for (let i = 0; i < 10; i++) texto += ALFABETO_DE_RECUPERACAO[randomInt(ALFABETO_DE_RECUPERACAO.length)]
    codigos.add(`${texto.slice(0, 5)}-${texto.slice(5)}`)
  }
  return [...codigos]
}

export function normalizarCodigoDeRecuperacao(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function pareceCodigoDeRecuperacao(codigo: string): boolean {
  return normalizarCodigoDeRecuperacao(codigo).length === 10 && !/^\d+$/.test(normalizarCodigoDeRecuperacao(codigo))
}

export function resumoDoCodigoDeRecuperacao(codigo: string): string {
  return createHash('sha256').update(`recuperacao|${normalizarCodigoDeRecuperacao(codigo)}`).digest('hex')
}

export function resumoQueConfere(codigoDigitado: string, resumosGuardados: string[]): string | null {
  const resumo = Buffer.from(resumoDoCodigoDeRecuperacao(codigoDigitado), 'hex')
  let encontrado: string | null = null
  for (const guardado of resumosGuardados) {
    const outro = Buffer.from(guardado, 'hex')
    if (outro.length === resumo.length && timingSafeEqual(outro, resumo)) encontrado = guardado
  }
  return encontrado
}

function chaveDeCifra(segredoDoServidor: string): Buffer {
  return createHash('sha256').update(`segundo-fator|${segredoDoServidor}`).digest()
}

export function cifrarSegredo(segredoBase32: string, segredoDoServidor: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chaveDeCifra(segredoDoServidor), iv)
  const conteudo = Buffer.concat([cifra.update(segredoBase32, 'utf8'), cifra.final()])
  return ['v1', iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), conteudo.toString('base64url')].join('.')
}

export function decifrarSegredo(guardado: string, segredoDoServidor: string): string {
  const [versao, iv, etiqueta, conteudo] = guardado.split('.')
  if (versao !== 'v1' || !iv || !etiqueta || !conteudo) throw new Error('Segredo do login em duas etapas em formato desconhecido')
  const decifra = createDecipheriv('aes-256-gcm', chaveDeCifra(segredoDoServidor), Buffer.from(iv, 'base64url'))
  decifra.setAuthTag(Buffer.from(etiqueta, 'base64url'))
  return Buffer.concat([decifra.update(Buffer.from(conteudo, 'base64url')), decifra.final()]).toString('utf8')
}

export function confirmacaoRecente(segundoFatorEm: number | undefined, agora: Date): boolean {
  return typeof segundoFatorEm === 'number' && agora.getTime() - segundoFatorEm * 1000 <= VALIDADE_DA_CONFIRMACAO_MS && segundoFatorEm * 1000 <= agora.getTime() + 60_000
}

export function segundoFatorDoAdminExigido(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return true
  if (env.SEGUNDO_FATOR_DO_ADMIN === 'ligado') return true
  if (env.SEGUNDO_FATOR_DO_ADMIN === 'desligado') return false
  return env.NODE_ENV !== 'test'
}
