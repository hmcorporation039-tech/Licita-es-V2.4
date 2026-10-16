export function semRepeticao(texto: string): string {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ')
  for (let tamanho = Math.floor(palavras.length / 2); tamanho >= 2; tamanho--) {
    const inicio = palavras.slice(0, tamanho).join(' ').toLowerCase()
    const seguinte = palavras.slice(tamanho, tamanho * 2).join(' ').toLowerCase()
    if (inicio === seguinte) return palavras.slice(tamanho).join(' ')
  }
  return palavras.join(' ')
}
