export function misturarPorFonte<T>(itens: T[], ehDaFonteMajoritaria: (item: T) => boolean, aCada = 5): T[] {
  if (aCada < 2 || itens.length === 0) return itens.slice()
  const majoritaria: T[] = []
  const outras: T[] = []
  for (const item of itens) (ehDaFonteMajoritaria(item) ? majoritaria : outras).push(item)
  if (majoritaria.length === 0 || outras.length === 0) return itens.slice()
  const saida: T[] = []
  let im = 0
  let io = 0
  while (im < majoritaria.length || io < outras.length) {
    const ultimaPosicaoDaJanela = saida.length % aCada === aCada - 1
    if (ultimaPosicaoDaJanela && io < outras.length) saida.push(outras[io++])
    else if (im < majoritaria.length) saida.push(majoritaria[im++])
    else saida.push(outras[io++])
  }
  return saida
}
