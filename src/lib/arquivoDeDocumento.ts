export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024

export type TipoDeArquivo = 'application/pdf' | 'image/jpeg' | 'image/png'

const EXTENSAO: Record<TipoDeArquivo, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export function detectarTipoDeArquivo(conteudo: Buffer): TipoDeArquivo | null {
  if (conteudo.length >= 5 && conteudo.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) return 'image/jpeg'
  if (conteudo.length >= 8 && conteudo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

export function extensaoDoTipo(tipo: TipoDeArquivo): string {
  return EXTENSAO[tipo]
}

export function nomeDeArquivoSeguro(nome: string | undefined | null, tipo: TipoDeArquivo): string {
  const base = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'documento'}.${EXTENSAO[tipo]}`
}

export function limiteDeArmazenamentoPorEmpresa(env: NodeJS.ProcessEnv = process.env): number {
  const mb = Number(env.MAX_ARQUIVOS_MB_EMPRESA)
  return (Number.isInteger(mb) && mb > 0 ? mb : 300) * 1024 * 1024
}
