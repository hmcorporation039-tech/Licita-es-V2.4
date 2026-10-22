export function lerValorEmReais(texto) {
  if (texto === null || texto === undefined) return null
  const limpo = String(texto).replace(/[\s ]/g, '').replace(/r\$/gi, '')
  const achado = limpo.match(/-?\d[\d.]*(?:,\d+)?/)
  if (!achado) return null
  const normalizado = achado[0].replace(/\./g, '').replace(',', '.')
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor <= 0) return null
  return Math.round(valor * 100) / 100
}

export function extrairMelhorLance(raiz, seletores) {
  if (!raiz || typeof raiz.querySelector !== 'function') return null
  for (const seletor of seletores) {
    let elemento
    try {
      elemento = raiz.querySelector(seletor)
    } catch {
      continue
    }
    if (!elemento) continue
    const valor = lerValorEmReais(elemento.textContent)
    if (valor !== null) return { valor, seletor }
  }
  return null
}
