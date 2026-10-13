function inteiroPositivoDoAmbiente(nome: string, padrao: number): number {
  const valor = Number(process.env[nome])
  return Number.isInteger(valor) && valor > 0 ? valor : padrao
}

export const limites = {
  get maxEmailsDiaPorEmpresa(): number {
    return inteiroPositivoDoAmbiente('MAX_EMAILS_DIA_EMPRESA', 50)
  },
}

export function inicioDoDiaUtc(agora = new Date()): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
}
