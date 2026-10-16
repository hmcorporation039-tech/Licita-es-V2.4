export function prefereMenosMovimento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function estaNaTela(elemento: Element): boolean {
  const caixa = elemento.getBoundingClientRect()
  return caixa.top < window.innerHeight && caixa.bottom > 0
}
