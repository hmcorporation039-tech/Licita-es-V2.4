import { formatarCnpj } from './documentosDaLicitacao/proponente'

export function mascararCpf(digitos: string): string {
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`
}

export function formatarDocumentoDoFornecedor(ni: string | null | undefined): string | null {
  if (!ni) return null
  const digitos = ni.replace(/\D/g, '')
  if (digitos.length === 14) return formatarCnpj(digitos)
  if (digitos.length === 11) return mascararCpf(digitos)
  return ni
}

export function documentoParaGuardar(ni: string | null | undefined): string | null {
  const limpo = ni?.trim()
  if (!limpo) return null
  const digitos = limpo.replace(/\D/g, '')
  return digitos.length === 11 ? mascararCpf(digitos) : limpo
}
