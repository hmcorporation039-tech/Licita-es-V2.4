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
