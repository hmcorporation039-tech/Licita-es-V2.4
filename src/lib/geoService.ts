// ============================================================
// lib/geoService.ts — Coordenadas de municípios brasileiros (IBGE)
// e cálculo de distância, para o filtro de raio de distância.
// Fonte dos dados: github.com/kelvins/municipios-brasileiros (domínio público, IBGE)
// ============================================================

import municipiosData from './municipiosBrasil.json'

// [codigoIbge, uf, nomeNormalizado, lat, lng]
type MunicipioRow = [string, string, string, number, number]

const rows = municipiosData as MunicipioRow[]

const byIbge = new Map<string, MunicipioRow>()
const byNomeUf = new Map<string, MunicipioRow>()
for (const row of rows) {
  byIbge.set(row[0], row)
  byNomeUf.set(`${row[2]}|${row[1]}`, row)
}

export interface Municipio {
  codigoIbge: string
  uf: string
  nome: string
  lat: number
  lng: number
}

export function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function toMunicipio(row: MunicipioRow): Municipio {
  return { codigoIbge: row[0], uf: row[1], nome: row[2], lat: row[3], lng: row[4] }
}

export function getMunicipioByIbge(codigoIbge: string): Municipio | undefined {
  const row = byIbge.get(String(codigoIbge))
  return row ? toMunicipio(row) : undefined
}

export function findMunicipioByNomeUf(nome: string, uf: string): Municipio | undefined {
  const row = byNomeUf.get(`${normalize(nome)}|${uf.toUpperCase()}`)
  return row ? toMunicipio(row) : undefined
}

// Distância em quilômetros entre dois pontos (fórmula de Haversine)
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
