export function identificadorCompraPncpValido(cnpj: string, ano: number | string, sequencial: number | string): boolean {
  return /^\d{14}$/.test(cnpj) && /^\d{4}$/.test(String(ano)) && /^\d{1,9}$/.test(String(sequencial))
}

export function assertIdentificadorCompraPncp(cnpj: string, ano: number | string, sequencial: number | string): void {
  if (!identificadorCompraPncpValido(cnpj, ano, sequencial)) {
    throw new Error('Identificador de compra do PNCP inválido')
  }
}
