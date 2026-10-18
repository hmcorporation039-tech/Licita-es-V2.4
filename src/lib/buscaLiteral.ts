export function literalNoLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&')
}
