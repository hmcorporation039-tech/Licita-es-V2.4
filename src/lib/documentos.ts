// ============================================================
// lib/documentos.ts — CPF e CNPJ: normalização e dígitos verificadores.
// O "um teste por CPF/CNPJ" depende de um documento VÁLIDO; sem checar os
// dígitos, qualquer sequência inventada abriria um novo período de teste.
// ============================================================

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

function todosIguais(d: string): boolean {
  return /^(\d)\1+$/.test(d)
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11 || todosIguais(d)) return false
  for (const tam of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i)
    const dv = ((soma * 10) % 11) % 10
    if (dv !== Number(d[tam])) return false
  }
  return true
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || todosIguais(d)) return false
  for (const tam of [12, 13]) {
    const pesos = tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * pesos[i]
    const resto = soma % 11
    const dv = resto < 2 ? 0 : 11 - resto
    if (dv !== Number(d[tam])) return false
  }
  return true
}
