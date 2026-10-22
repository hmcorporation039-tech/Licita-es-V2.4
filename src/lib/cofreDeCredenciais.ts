import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'
const TAM_IV = 12
const TAM_TAG = 16
const TAM_CHAVE = 32

export interface ChaveVersionada {
  versao: number
  chave: Buffer
}

function conferirChave(chave: ChaveVersionada): void {
  if (chave.chave.length !== TAM_CHAVE) {
    throw new Error('Chave do cofre precisa ter 32 bytes (AES-256).')
  }
  if (!Number.isInteger(chave.versao) || chave.versao < 1 || chave.versao > 255) {
    throw new Error('Versão da chave do cofre precisa ser um inteiro de 1 a 255.')
  }
}

export function cifrar(texto: string, chave: ChaveVersionada): Buffer {
  conferirChave(chave)
  const iv = randomBytes(TAM_IV)
  const cifrador = createCipheriv(ALGORITMO, chave.chave, iv)
  const corpo = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()])
  const tag = cifrador.getAuthTag()
  return Buffer.concat([Buffer.from([chave.versao]), iv, tag, corpo])
}

export function versaoDoBlob(blob: Buffer): number {
  if (blob.length < 1 + TAM_IV + TAM_TAG) throw new Error('Credencial cifrada inválida.')
  return blob[0]
}

export function decifrar(blob: Buffer, chaves: ChaveVersionada[]): string {
  const versao = versaoDoBlob(blob)
  const chave = chaves.find((c) => c.versao === versao)
  if (!chave) throw new Error('Chave do cofre para esta credencial não está carregada.')
  conferirChave(chave)
  const iv = blob.subarray(1, 1 + TAM_IV)
  const tag = blob.subarray(1 + TAM_IV, 1 + TAM_IV + TAM_TAG)
  const corpo = blob.subarray(1 + TAM_IV + TAM_TAG)
  const decifrador = createDecipheriv(ALGORITMO, chave.chave, iv)
  decifrador.setAuthTag(tag)
  return decifrador.update(corpo, undefined, 'utf8') + decifrador.final('utf8')
}

export function precisaRecifrar(blob: Buffer, versaoAtual: number): boolean {
  return versaoDoBlob(blob) !== versaoAtual
}

function lerChaveDoAmbiente(valor: string | undefined, versao: number): ChaveVersionada | null {
  const limpo = valor?.trim()
  if (!limpo) return null
  const chave = Buffer.from(limpo, 'base64')
  return { versao, chave }
}

export function chavesDoAmbiente(env: NodeJS.ProcessEnv = process.env): {
  atual: ChaveVersionada
  todas: ChaveVersionada[]
} {
  const versaoAtual = Number(env.CREDENCIAIS_PORTAL_CHAVE_VERSAO ?? '1')
  const atual = lerChaveDoAmbiente(env.CREDENCIAIS_PORTAL_CHAVE, Number.isInteger(versaoAtual) ? versaoAtual : 1)
  if (!atual) throw new Error('Defina CREDENCIAIS_PORTAL_CHAVE (32 bytes em base64).')
  conferirChave(atual)
  const anterior = lerChaveDoAmbiente(env.CREDENCIAIS_PORTAL_CHAVE_ANTERIOR, atual.versao - 1)
  const todas = anterior ? [atual, anterior] : [atual]
  return { atual, todas }
}
