import { findMunicipioByNomeUf } from './geoService'

export interface LocalCitado {
  nome: string
  uf: string
  lat: number
  lng: number
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
const PALAVRA = "[A-ZÀ-Ý][\\p{L}'’.-]*"
const NOME = `${PALAVRA}(?:\\s+(?:d[aeo]s?|${PALAVRA}))*`

function candidatosComUf(texto: string): Array<{ nome: string; uf: string }> {
  const achados: Array<{ nome: string; uf: string }> = []
  const padrao = new RegExp(`(${NOME})\\s*(?:\\/|-|–|,)\\s*([A-Z]{2})\\b`, 'gu')
  for (const m of texto.matchAll(padrao)) {
    if (!UFS.has(m[2])) continue
    const palavras = m[1].trim().split(/\s+/)
    for (let i = 0; i < palavras.length; i++) achados.push({ nome: palavras.slice(i).join(' '), uf: m[2] })
  }
  return achados
}

function candidatosSemUf(texto: string): string[] {
  const padrao = new RegExp(`(?:munic[íi]pio|cidade)\\s+de\\s+(${NOME})`, 'giu')
  return [...texto.matchAll(padrao)].map((m) => m[1].trim())
}

export function municipioCitado(textos: Array<string | null | undefined>, ufPadrao: string | null): LocalCitado | null {
  for (const texto of textos) {
    if (!texto) continue
    for (const c of candidatosComUf(texto)) {
      const m = findMunicipioByNomeUf(c.nome, c.uf)
      if (m) return { nome: c.nome, uf: m.uf, lat: m.lat, lng: m.lng }
    }
    if (ufPadrao) {
      for (const nome of candidatosSemUf(texto)) {
        const palavras = nome.split(/\s+/)
        for (let fim = palavras.length; fim > 0; fim--) {
          const candidato = palavras.slice(0, fim).join(' ')
          const m = findMunicipioByNomeUf(candidato, ufPadrao)
          if (m) return { nome: candidato, uf: m.uf, lat: m.lat, lng: m.lng }
        }
      }
    }
  }
  return null
}
