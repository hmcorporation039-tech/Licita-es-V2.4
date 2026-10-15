export interface ItemParaReadequar {
  id: string
  quantidade: number
  precoBase: number | null
}

export interface LancesFinais {
  global: number | null
  porItem: Record<string, number>
}

export interface Readequacao {
  precos: Record<string, number>
  total: number
  pendencias: string[]
}

const centavos = (v: number) => Math.round(v * 100)

export function readequarPrecos(itens: ItemParaReadequar[], lances: LancesFinais): Readequacao {
  const pendencias: string[] = []
  const precos: Record<string, number> = {}
  const restantes = itens.filter((it) => lances.porItem[it.id] === undefined)

  for (const it of itens) {
    const lance = lances.porItem[it.id]
    if (lance !== undefined) precos[it.id] = Math.floor(centavos(lance) / it.quantidade) / 100
  }

  if (restantes.length > 0 && lances.global !== null) {
    const jaDistribuido = itens.filter((it) => precos[it.id] !== undefined).reduce((s, it) => s + centavos(precos[it.id]) * it.quantidade, 0)
    const alvo = centavos(lances.global) - jaDistribuido
    const pesos = restantes.map((it) => (it.precoBase !== null && it.precoBase > 0 ? it.precoBase * it.quantidade : 0))
    const somaDosPesos = pesos.reduce((a, b) => a + b, 0)
    if (alvo <= 0) {
      pendencias.push('o lance final global é menor que a soma dos lances por item')
    } else if (somaDosPesos <= 0) {
      pendencias.push('preço de venda dos itens no estudo de custos (necessário para distribuir o lance global)')
    } else {
      let usado = 0
      restantes.forEach((it, i) => {
        const unitario = Math.floor((alvo * (pesos[i] / somaDosPesos)) / it.quantidade)
        precos[it.id] = unitario / 100
        usado += unitario * it.quantidade
      })
      let sobra = alvo - usado
      for (const it of [...restantes].sort((a, b) => a.quantidade - b.quantidade)) {
        if (sobra <= 0) break
        const passos = Math.floor(sobra / it.quantidade)
        if (passos > 0) {
          precos[it.id] = (centavos(precos[it.id]) + passos) / 100
          sobra -= passos * it.quantidade
        }
      }
    }
  } else if (restantes.length > 0) {
    pendencias.push(`lance final de ${restantes.length} item(ns)`)
  }

  const total = itens.reduce((s, it) => s + (precos[it.id] !== undefined ? centavos(precos[it.id]) * it.quantidade : 0), 0) / 100
  return { precos, total, pendencias }
}
